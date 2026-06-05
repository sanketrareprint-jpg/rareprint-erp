"""
Customer References
═══════════════════
Returns nearby customer references for social proof.
"""

# City -> list of customer names/shops
CUSTOMER_DB: dict[str, list[str]] = {
    "mumbai":     ["Sharma Medical, Andheri", "Life Care Pharmacy, Bandra"],
    "pune":       ["Agarwal Medical Store, Kothrud", "Sai Medicals, Hadapsar"],
    "nagpur":     ["Gupta Medical, Sitabuldi", "City Pharma, Dharampeth"],
    "chandrapur": ["Raje Medical, Main Road", "Om Medicals, Gandhi Chowk"],
    "delhi":      ["Capital Pharmacy, Karol Bagh", "Delhi Medicals, Lajpat Nagar"],
    "hyderabad":  ["Hyderabad Pharma, Banjara Hills", "Star Medicals, Secunderabad"],
    "bangalore":  ["Bangalore Medicals, Koramangala", "Health Plus, Indiranagar"],
    "chennai":    ["Chennai Pharma, T Nagar", "Apollo Medicals, Anna Nagar"],
    "kolkata":    ["Kolkata Medicals, Park Street", "Bengal Pharma, Howrah"],
    "ahmedabad":  ["Ahmedabad Pharmacy, CG Road", "Gujarat Medicals, Navrangpura"],
    "surat":      ["Surat Medicals, Ring Road", "Diamond Pharma, Adajan"],
    "jaipur":     ["Jaipur Medicals, MI Road", "Pink City Pharmacy, Vaishali Nagar"],
    "lucknow":    ["Lucknow Pharma, Hazratganj", "Capital Medicals, Gomti Nagar"],
    "noida":      ["Noida Medicals, Sector 18", "Greater Pharmacy, Sector 63"],
    "gurgaon":    ["Gurgaon Medicals, DLF Phase", "Cyber Pharmacy, Sector 29"],
}


def get_customers_by_city(city: str) -> list[str]:
    """Return customer references for a given city."""
    if not city:
        return []
    city_lower = city.lower().strip()
    # Direct match
    if city_lower in CUSTOMER_DB:
        return CUSTOMER_DB[city_lower]
    # Partial match
    for key, refs in CUSTOMER_DB.items():
        if key in city_lower or city_lower in key:
            return refs
    return []
