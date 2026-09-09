# Fship staging validation test (v3 -- no curl.exe dependency at all; uses
# .NET's HttpClient directly, which ships with every PowerShell version, so
# nothing needs to be installed).
#
# Run from PowerShell in this folder: .\test-fship-staging.ps1
# Result: fship-staging-log.txt with every request (shown as an equivalent
# curl command, for Fship's benefit) + the real HTTP status and JSON response.
# Paste that file's contents into your reply to Fship support.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$base = "https://capi-qc.fship.in"
$key  = "085c36066064af83c66b9dbf44d190d40feec79f437bc1c1cb"
$log  = "$PSScriptRoot\fship-staging-log.txt"

$handler = New-Object System.Net.Http.HttpClientHandler
$client  = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)

"Fship staging validation log -- $(Get-Date)" | Out-File -Encoding utf8 $log

function Run-Step($name, $method, $path, $body) {
    $url = "$base$path"
    $curlEquivalent = "curl.exe -s -i -X $method `"$url`" -H `"Content-Type: application/json`" -H `"signature: $key`"" + $(if ($body) { " -d '$body'" } else { "" })

    Add-Content -Encoding utf8 $log "`n===== $name ====="
    Add-Content -Encoding utf8 $log $curlEquivalent
    Add-Content -Encoding utf8 $log "--- response ---"

    try {
        $httpMethod = [System.Net.Http.HttpMethod]::$method
        $request = New-Object System.Net.Http.HttpRequestMessage($httpMethod, $url)
        $request.Headers.Add("signature", $key)
        if ($body) {
            $request.Content = New-Object System.Net.Http.StringContent($body, [System.Text.Encoding]::UTF8, "application/json")
        }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $respBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $statusLine = "HTTP $([int]$response.StatusCode) $($response.ReasonPhrase)"

        Add-Content -Encoding utf8 $log $statusLine
        Add-Content -Encoding utf8 $log $respBody

        Write-Host "`n--- $name ---" -ForegroundColor Cyan
        Write-Host $statusLine
        Write-Host $respBody

        return $respBody
    } catch {
        $msg = $_.Exception.Message
        Add-Content -Encoding utf8 $log "ERROR: $msg"
        Write-Host "`n--- $name --- ERROR: $msg" -ForegroundColor Red
        return $null
    }
}

# 1) Get Courier List
Run-Step "GET_COURIER_LIST" "Get" "/api/getallcourier" $null | Out-Null

# 2) Rate Calculator
$rateBody = '{"source_Pincode":"395010","destination_Pincode":"400001","payment_Mode":"P","amount":500,"express_Type":"surface","shipment_Weight":1,"shipment_Length":10,"shipment_Width":10,"shipment_Height":10,"volumetric_Weight":0}'
Run-Step "RATE_CALCULATOR" "Post" "/api/ratecalculator" $rateBody | Out-Null

# 3) Add Warehouse -- Fship support (Anurag Agrawal) confirmed a known-good
# staging combination: pickup pincode 110094 or 110042, courierId 1,
# destination 400070 or 201301. Registering a new warehouse on pincode
# 110042 (Delhi) since our earlier real/test pincodes (442402, 395010)
# weren't in staging's serviceable set.
$warehouseName3 = "RAREPRINT-STAGING-TEST2-$(Get-Date -Format yyyyMMddHHmmss)"
$warehouseBody3 = '{"warehouseId":0,"warehouseName":"' + $warehouseName3 + '","contactName":"Sanket Pimpalkar","addressLine1":"Test Address","addressLine2":"","pincode":"110042","city":"Delhi","stateId":0,"countryId":0,"phoneNumber":"9637318960","email":"sanket.rareprint@gmail.com"}'
$r3w3 = Run-Step "ADD_WAREHOUSE_FSHIP_CONFIRMED" "Post" "/api/addwarehouse" $warehouseBody3

$pickAddressId = 13261
try {
    if ($r3w3) {
        $parsedW3 = $r3w3 | ConvertFrom-Json
        if ($parsedW3.status -eq $true -and $parsedW3.warehouseId -gt 0) { $pickAddressId = $parsedW3.warehouseId }
    }
} catch { }

# 4) Create Forward Order -- destination 400070, courierId 1, per Fship's
# confirmed combination.
$orderId = "TEST-$(Get-Date -Format yyyyMMddHHmmss)"
$orderBody = '{"customer_Name":"Test Customer","customer_Mobile":"9999999999","customer_Emailid":"noreply@example.com","customer_Address":"123 Test Street","landMark":"","customer_Address_Type":"Home","customer_PinCode":"400070","customer_City":"Mumbai","orderId":"' + $orderId + '","invoice_Number":"TEST-INV-1","payment_Mode":2,"express_Type":"surface","is_Ndd":0,"order_Amount":500,"tax_Amount":0,"extra_Charges":0,"total_Amount":500,"cod_Amount":0,"shipment_Weight":1,"shipment_Length":10,"shipment_Width":10,"shipment_Height":10,"volumetric_Weight":0,"pick_Address_ID":' + $pickAddressId + ',"products":[{"productId":"SKU1","productName":"Test Product","unitPrice":500,"quantity":1,"productCategory":"","hsnCode":"","sku":"SKU1","taxRate":0,"productDiscount":0}],"courierId":1}'
$r3 = Run-Step "CREATE_FORWARD_ORDER" "Post" "/api/createforwardorder" $orderBody

# Try to pull the waybill out of step 3's JSON response
$waybill = $null
try {
    if ($r3) {
        $parsed = $r3 | ConvertFrom-Json
        if ($parsed.waybill) { $waybill = $parsed.waybill }
    }
} catch { }

if ($waybill) {
    Run-Step "REGISTER_PICKUP" "Post" "/api/registerpickup" ('{"waybills":["' + $waybill + '"]}') | Out-Null
    # Fship support confirmed the real endpoint is /api/shipmentcurrentstatus
    # (not /api/shipmentsummary from the PDF, which 404s) -- same payload/response shape.
    Run-Step "SHIPMENT_CURRENT_STATUS" "Post" "/api/shipmentcurrentstatus" ('{"waybill":"' + $waybill + '"}') | Out-Null
} else {
    Add-Content -Encoding utf8 $log "`n===== REGISTER_PICKUP / SHIPMENT_CURRENT_STATUS ====="
    Add-Content -Encoding utf8 $log "Skipped -- no waybill found in createforwardorder's response above."
    Write-Host "`nNo waybill found -- skipped pickup/status. Check CREATE_FORWARD_ORDER's response above." -ForegroundColor Yellow
}

$client.Dispose()
Write-Host "`n`nDone. Full log saved to: $log" -ForegroundColor Green
