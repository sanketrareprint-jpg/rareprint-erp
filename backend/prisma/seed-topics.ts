import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TOPICS = [
  {
    "orderIndex": 1,
    "groupNumber": 1,
    "titleEn": "The First Hello — How to Open a Cold Call",
    "titleHi": "पहली हैलो — कोल्ड कॉल कैसे शुरू करें",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "BEGINNER",
    "estimatedMins": 8,
    "contentEn": "Most salespeople lose the sale in the first 10 seconds — not because of price, not because of product, but because of how they open.\n\nThe opening sets the entire emotional tone of a call. If you sound like a salesperson, the chemist's brain immediately goes into rejection mode. But if you sound like a helpful neighbor, they stay open.\n\nThe 4 Rules of a Perfect Opening:\n\n1. Never start with your product name first\n\"I'm calling about our medicine pouches\" = selling mode triggered instantly.\n\n2. Start with THEIR world, not yours\nBad: \"Hello sir, I'm Rahul from RarePrint, we make medicine pouches...\"\nGood: \"Hello sir, quick question — how many patients visit your store on a typical Monday?\"\n\n3. Use a Pattern Interrupt\n\"Sir, I'm calling to ask for your opinion, not to sell anything — would that be okay?\" Nobody expects this. They say yes. Now they're curious.\n\n4. Your tone is louder than your words\nSmile before you dial. A smiling voice is physically different — warmer, more energetic. The chemist on the other end feels it even through the phone.\n\nThe 3-second rule: In 3 seconds, the chemist decides: friend or salesperson? Make them feel friend.",
    "contentHi": "ज़्यादातर सेल्सपर्सन पहले 10 सेकंड में ही सेल गंवा देते हैं — कीमत की वजह से नहीं, प्रोडक्ट की वजह से नहीं, बल्कि शुरुआत करने के तरीके की वजह से।\n\nपरफेक्ट ओपनिंग के 4 नियम:\n\n1. अपने प्रोडक्ट के नाम से कभी शुरू न करें\n\"मैं मेडिसिन पाउच के बारे में कॉल कर रहा हूँ\" = केमिस्ट का दिमाग तुरंत रिजेक्शन मोड में जाता है।\n\n2. उनकी दुनिया से शुरू करें, अपनी से नहीं\nगलत: \"नमस्ते सर, मैं Rahul हूँ RarePrint से...\"\nसही: \"नमस्ते सर, एक छोटा सवाल — सोमवार को आपकी दुकान में आमतौर पर कितने मरीज़ आते हैं?\"\n\n3. Pattern Interrupt इस्तेमाल करें\n\"सर, मैं कुछ बेचने के लिए नहीं, आपकी राय लेने के लिए कॉल कर रहा हूँ — क्या यह ठीक है?\"\n\n4. आपका टोन आपके शब्दों से ज़्यादा ज़ोर से बोलता है\nडायल करने से पहले मुस्कुराएं। मुस्कुराती आवाज़ गर्म और ऊर्जावान होती है।",
    "scriptEn": "Hello sir, quick question before I say anything else — on a typical day, how many medicine packets do you hand out to patients?\n\n(They answer)\n\nInteresting! And when you hand those packets — are they plain paper, or do they have your pharmacy name on them?\n\n(If plain) That's exactly why I called. I help medical stores turn those plain packets into a free daily advertisement. Takes 2 minutes to explain — would that be okay?",
    "scriptHi": "नमस्ते सर, कुछ और बोलने से पहले एक छोटा सवाल — एक आम दिन में आप कितने मेडिसिन पैकेट मरीज़ों को देते हैं?\n\n(वे जवाब देते हैं)\n\nअच्छा! और वो पैकेट — उन पर आपकी दुकान का नाम होता है, या सादे होते हैं?\n\n(अगर सादे हैं) यही वजह है मेरी कॉल की। मैं मेडिकल स्टोर के साथ काम करता हूँ ताकि वो सादे पैकेट आपकी दुकान का रोज़ का मुफ्त विज्ञापन बन जाएं। 2 मिनट में समझाता हूँ — ठीक है?",
    "keyPoints": [
      "Open with a question about THEIR world",
      "Pattern interrupt: 'calling for your opinion'",
      "Smile before you dial",
      "3 seconds to decide: friend or salesperson",
      "Never trigger selling mode in first sentence"
    ],
    "questions": [
      {
        "questionEn": "What is the PRIMARY mistake most salespeople make in the first 10 seconds?",
        "questionHi": "ज़्यादातर सेल्सपर्सन पहले 10 सेकंड में कौन सी मुख्य गलती करते हैं?",
        "options": {
          "en": [
            "They forget the customer's name",
            "They open by pitching their product immediately",
            "They speak too slowly",
            "They ask for the manager"
          ],
          "hi": [
            "वे ग्राहक का नाम भूल जाते हैं",
            "वे तुरंत अपना प्रोडक्ट पिच करके शुरू करते हैं",
            "वे बहुत धीरे बोलते हैं",
            "वे मैनेजर के लिए पूछते हैं"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Opening with a product pitch immediately triggers the prospect's rejection mode.",
        "explanationHi": "प्रोडक्ट पिच से शुरू करने पर ग्राहक तुरंत रिजेक्शन मोड में आ जाता है।"
      },
      {
        "questionEn": "A 'Pattern Interrupt' opening for medicine pouch calls sounds like:",
        "questionHi": "मेडिसिन पाउच कॉल के लिए 'Pattern Interrupt' ओपनिंग कैसी लगती है:",
        "options": {
          "en": [
            "'Sir we have the best pouches in India'",
            "'Sir, I'm calling for your opinion, not to sell — is that okay?'",
            "'Sir would you like to buy 5000 pouches?'",
            "'Sir our price is very competitive'"
          ],
          "hi": [
            "'सर हमारे पास भारत के सबसे अच्छे पाउच हैं'",
            "'सर, मैं आपकी राय के लिए कॉल कर रहा हूँ, बेचने के लिए नहीं — ठीक है?'",
            "'सर क्या आप 5000 पाउच खरीदना चाहेंगे?'",
            "'सर हमारी कीमत बहुत प्रतिस्पर्धी है'"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This unexpected opening creates curiosity and removes immediate resistance.",
        "explanationHi": "यह अप्रत्याशित ओपनिंग जिज्ञासा पैदा करती है और तुरंत प्रतिरोध हटाती है।"
      },
      {
        "questionEn": "Why does smiling before dialing actually work on a phone call?",
        "questionHi": "फोन कॉल पर डायल करने से पहले मुस्कुराना वास्तव में क्यों काम करता है?",
        "options": {
          "en": [
            "It makes you look professional",
            "A smiling voice sounds physically warmer and more energetic",
            "It gives you confidence to speak louder",
            "It helps you remember the script"
          ],
          "hi": [
            "यह आपको पेशेवर दिखाता है",
            "मुस्कुराती आवाज़ शारीरिक रूप से गर्म और अधिक ऊर्जावान लगती है",
            "यह आपको ज़ोर से बोलने का आत्मविश्वास देता है",
            "यह आपको स्क्रिप्ट याद रखने में मदद करता है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Smiling physically changes your voice quality — it becomes warmer and more energetic, which the listener subconsciously feels.",
        "explanationHi": "मुस्कुराना शारीरिक रूप से आवाज़ की गुणवत्ता बदल देता है।"
      },
      {
        "questionEn": "The best first question to ask a chemist is:",
        "questionHi": "एक केमिस्ट से पूछने के लिए सबसे अच्छा पहला सवाल है:",
        "options": {
          "en": [
            "'What is your annual turnover?'",
            "'How many patients visit your store on a typical day?'",
            "'Do you have a GST number?'",
            "'Who is your current supplier?'"
          ],
          "hi": [
            "'आपका वार्षिक टर्नओवर क्या है?'",
            "'एक आम दिन में आपकी दुकान में कितने मरीज़ आते हैं?'",
            "'क्या आपके पास GST नंबर है?'",
            "'आपका मौजूदा सप्लायर कौन है?'"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This question is about their world, non-threatening, and naturally leads to your product.",
        "explanationHi": "यह सवाल उनकी दुनिया के बारे में है, गैर-धमकी भरा है, और स्वाभाविक रूप से आपके प्रोडक्ट तक ले जाता है।"
      },
      {
        "questionEn": "In the 3-second rule, what decision does the chemist make?",
        "questionHi": "3-सेकंड नियम में, केमिस्ट कौन सा निर्णय लेता है?",
        "options": {
          "en": [
            "Whether to buy or not",
            "Whether you are a friend or a salesperson",
            "Whether your price is fair",
            "Whether to ask for a sample"
          ],
          "hi": [
            "खरीदना है या नहीं",
            "आप दोस्त हैं या सेल्सपर्सन",
            "क्या आपकी कीमत उचित है",
            "सैम्पल मांगना है या नहीं"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "In 3 seconds, the brain categorizes the caller as friend (open) or salesperson (defensive).",
        "explanationHi": "3 सेकंड में दिमाग कॉलर को दोस्त (खुला) या सेल्सपर्सन (रक्षात्मक) में वर्गीकृत करता है।"
      }
    ]
  },
  {
    "orderIndex": 2,
    "groupNumber": 1,
    "titleEn": "Voice & Tone — Your Invisible Sales Tool",
    "titleHi": "आवाज़ और टोन — आपका अदृश्य सेल्स टूल",
    "sourceBook": "The Psychology of Selling by Brian Tracy",
    "difficulty": "BEGINNER",
    "estimatedMins": 9,
    "contentEn": "UCLA research found that in communication: 7% is the words you say, 38% is your tone of voice, 55% is body language. On a phone call, body language disappears — so your tone carries 93% of the message.\n\nThis is the most underused skill in phone sales.\n\nThe 5 Tone Modes Every Salesperson Needs:\n\n1. The Warm Opener Tone\nSlightly higher pitch, energetic, like you're genuinely happy to speak with them. Not fake — think of calling a friend you haven't spoken to in a while.\n\n2. The Expert Tone\nSlower, deeper, confident. Use when explaining GSM quality, printing process, or why your paper is different. \"Our 70 GSM paper has a specific tensile strength that prevents tearing when medicine bottles rub against it.\"\n\n3. The Curious Tone\nGenuinely interested, leaning in. Use during SPIN questions. \"Oh really? How many packets is that per week?\"\n\n4. The Empathy Tone\nSoft, paced, almost at a whisper level. Use when they object. \"I completely understand that...\"\n\n5. The Assumptive Close Tone\nCalm, matter-of-fact, like the outcome is obvious. \"So shall I lock in 5000 pieces for you? We can do the design this week itself.\"\n\nPace matching: If the chemist speaks slowly (rural area, older), slow down. If they speak fast (urban, busy), match their speed. Mismatched pace = disconnect.",
    "contentHi": "UCLA रिसर्च ने पाया: संचार में 7% वे शब्द हैं जो आप कहते हैं, 38% आपकी आवाज़ का टोन है, 55% बॉडी लैंग्वेज है। फोन कॉल पर बॉडी लैंग्वेज गायब हो जाती है — इसलिए आपका टोन 93% संदेश देता है।\n\n5 टोन मोड जो हर सेल्सपर्सन को चाहिए:\n\n1. वार्म ओपनर टोन — थोड़ा ऊंचा, ऊर्जावान\n2. एक्सपर्ट टोन — धीमा, गहरा, आत्मविश्वासी\n3. जिज्ञासु टोन — वास्तव में रुचि रखने वाला\n4. सहानुभूति टोन — नरम, लगभग फुसफुसाहट स्तर पर\n5. असम्पटिव क्लोज़ टोन — शांत, तथ्यात्मक\n\nPace Matching: अगर केमिस्ट धीरे बोलता है, धीमे हो जाएं। अगर तेज़ बोलता है, उनकी गति मिलाएं।",
    "scriptEn": "(Expert tone, confident and measured)\n\"Sir, you know what separates our pouches from what you get in the local market? The paper itself. We use 70 GSM tensile-grade paper — most local pouches are 40-50 GSM. When a medicine bottle rubs against a thin pouch, it tears. Ours doesn't.\n\n(Shift to curious tone)\nWhat GSM are the bags you're currently using, do you know?\n\n(They likely don't know — and that's the point)\n\n(Warm tone, friendly)\nMost store owners don't know — and that's okay. But now you know why some packets last and some don't. Ours last. And they have your pharmacy name printed on them too.\"\n",
    "scriptHi": "(एक्सपर्ट टोन, आत्मविश्वासी)\n\"सर, आपको पता है हमारे पाउच लोकल मार्केट से क्या अलग करता है? पेपर खुद। हम 70 GSM टेंसाइल-ग्रेड पेपर इस्तेमाल करते हैं — ज़्यादातर लोकल पाउच 40-50 GSM के होते हैं। जब दवाई की बोतल पतले पाउच से रगड़ती है, तो वो फट जाता है। हमारा नहीं फटता।\n\n(जिज्ञासु टोन में बदलें)\nअभी आप जो बैग इस्तेमाल करते हैं, उनका GSM क्या है, क्या पता है?\n\n(वार्म टोन)\nज़्यादातर दुकान मालिकों को नहीं पता — और यह ठीक है। लेकिन अब आप जानते हैं कि कुछ पैकेट टिकते हैं और कुछ नहीं। हमारे टिकते हैं। और उन पर आपकी दुकान का नाम भी छपा होता है।\"\n",
    "keyPoints": [
      "Tone carries 93% of message on phone calls",
      "Use Expert tone when explaining GSM and quality",
      "Use Empathy tone during objections",
      "Pace match the chemist's speaking speed",
      "Switch tones deliberately throughout the call"
    ],
    "questions": [
      {
        "questionEn": "On a phone call, what percentage of the message is carried by your tone of voice?",
        "questionHi": "फोन कॉल पर, आपके टोन ऑफ वॉयस द्वारा संदेश का कितना प्रतिशत दिया जाता है?",
        "options": {
          "en": [
            "7%",
            "38%",
            "55%",
            "93%"
          ],
          "hi": [
            "7%",
            "38%",
            "55%",
            "93%"
          ]
        },
        "correctIndex": 3,
        "explanationEn": "On a phone call, body language (55%) disappears, so tone (38%) + words (7%) = 45% becomes 93% effective weight since body language is gone.",
        "explanationHi": "फोन कॉल पर, बॉडी लैंग्वेज गायब हो जाती है, इसलिए टोन का वजन 93% हो जाता है।"
      },
      {
        "questionEn": "Which tone should you use when explaining 70 GSM paper quality to a chemist?",
        "questionHi": "केमिस्ट को 70 GSM पेपर क्वालिटी समझाते समय कौन सा टोन इस्तेमाल करना चाहिए?",
        "options": {
          "en": [
            "Warm Opener Tone",
            "Expert Tone",
            "Empathy Tone",
            "Assumptive Close Tone"
          ],
          "hi": [
            "वार्म ओपनर टोन",
            "एक्सपर्ट टोन",
            "सहानुभूति टोन",
            "असम्पटिव क्लोज़ टोन"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Expert tone — slower, deeper, confident — builds credibility when explaining technical product details.",
        "explanationHi": "एक्सपर्ट टोन — धीमा, गहरा, आत्मविश्वासी — तकनीकी उत्पाद विवरण समझाते समय विश्वसनीयता बनाता है।"
      },
      {
        "questionEn": "A chemist in a rural area speaks slowly. You should:",
        "questionHi": "ग्रामीण क्षेत्र का एक केमिस्ट धीरे बोलता है। आपको:",
        "options": {
          "en": [
            "Speak faster to save time",
            "Match their pace and speak slowly too",
            "Use more technical terms",
            "Speak louder"
          ],
          "hi": [
            "समय बचाने के लिए तेज़ बोलें",
            "उनकी गति मिलाएं और धीरे बोलें",
            "अधिक तकनीकी शब्दों का उपयोग करें",
            "ज़ोर से बोलें"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Pace matching creates subconscious rapport. Mismatched pace creates disconnect.",
        "explanationHi": "गति मिलाना अवचेतन तालमेल बनाता है। असमान गति断开करती है।"
      },
      {
        "questionEn": "When a chemist objects to price, which tone is most effective?",
        "questionHi": "जब एक केमिस्ट कीमत पर आपत्ति करता है, कौन सा टोन सबसे प्रभावी है?",
        "options": {
          "en": [
            "Loud and assertive",
            "Soft empathy tone, almost at whisper level",
            "Fast and excited",
            "Same tone as the opening"
          ],
          "hi": [
            "ज़ोर से और दृढ़",
            "नरम सहानुभूति टोन, लगभग फुसफुसाहट स्तर",
            "तेज़ और उत्साहित",
            "ओपनिंग जैसा ही टोन"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Soft empathy tone de-escalates tension and makes the customer feel understood before you address their objection.",
        "explanationHi": "नरम सहानुभूति टोन तनाव कम करता है और ग्राहक को समझा हुआ महसूस कराता है।"
      },
      {
        "questionEn": "The Assumptive Close tone is best described as:",
        "questionHi": "असम्पटिव क्लोज़ टोन को सबसे अच्छे से कैसे वर्णित किया जाता है:",
        "options": {
          "en": [
            "Excited and urgent",
            "Calm and matter-of-fact, as if the outcome is obvious",
            "Questioning and hesitant",
            "Loud and commanding"
          ],
          "hi": [
            "उत्साहित और तत्काल",
            "शांत और तथ्यात्मक, जैसे परिणाम स्पष्ट हो",
            "प्रश्नवाचक और हिचकिचाते",
            "ज़ोर से और आदेशात्मक"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "The assumptive close tone projects confidence that the deal is happening, which psychologically pulls the customer toward yes.",
        "explanationHi": "असम्पटिव क्लोज़ टोन विश्वास दर्शाता है कि डील हो रही है।"
      }
    ]
  },
  {
    "orderIndex": 3,
    "groupNumber": 1,
    "titleEn": "Active Listening — Hear What They Don't Say",
    "titleHi": "सक्रिय श्रवण — वो सुनें जो वे नहीं कहते",
    "sourceBook": "How to Win Friends and Influence People by Dale Carnegie",
    "difficulty": "BEGINNER",
    "estimatedMins": 10,
    "contentEn": "Dale Carnegie said: \"You can make more friends in two months by becoming interested in other people than you can in two years by trying to get other people interested in you.\"\n\nThe same applies to sales. Chemists don't want to be sold to. They want to be heard.\n\nActive listening is not just being quiet while they talk. It is the deliberate act of absorbing, interpreting, and responding to what they say — including what they DON'T say.\n\nThe 4 Levels of Listening:\n\nLevel 1 — Waiting to talk\nYou hear words but you're already forming your response. This is most salespeople. The chemist feels unheard.\n\nLevel 2 — Hearing the words\nYou understand what they said. Basic. Not enough.\n\nLevel 3 — Listening for emotion\nYou notice HOW they say something. \"The prices have gone up\" said with frustration vs. resignation — totally different opportunities.\n\nLevel 4 — Listening for the unsaid\nWhat are they NOT saying? If a chemist says \"My customers don't care about packaging,\" they might actually mean \"I don't want to spend money right now.\" That's a budget objection dressed as an opinion.\n\nThree Active Listening Techniques:\n1. The Echo: Repeat the last 2-3 words as a question. \"Don't care about packaging?\" — makes them explain.\n2. The Pause: After they finish, wait 3 seconds before speaking. They often add valuable information in that silence.\n3. The Summary: \"So if I understand correctly — your main concern is that 5000 pieces is more than you'd use in a reasonable time, is that right?\" This makes them feel heard AND clarifies their real objection.",
    "contentHi": "Dale Carnegie ने कहा: \"दूसरे लोगों में रुचि लेकर आप 2 महीने में जितने दोस्त बना सकते हैं, उतने 2 साल में दूसरों को अपने में रुचि दिलाने की कोशिश से नहीं बना सकते।\"\n\nसुनने के 4 स्तर:\n\nस्तर 1 — बात करने का इंतज़ार: आप शब्द सुनते हैं लेकिन पहले से जवाब बना रहे हैं।\nस्तर 2 — शब्द सुनना: आप समझते हैं जो उन्होंने कहा। बुनियादी। पर्याप्त नहीं।\nस्तर 3 — भावना के लिए सुनना: आप ध्यान देते हैं कि वे कुछ कैसे कहते हैं।\nस्तर 4 — अनकहे के लिए सुनना: वे क्या नहीं कह रहे?\n\nतीन सक्रिय श्रवण तकनीकें:\n1. Echo: अंतिम 2-3 शब्दों को प्रश्न के रूप में दोहराएं।\n2. Pause: उनके खत्म होने के बाद 3 सेकंड रुकें।\n3. Summary: \"तो अगर मैं सही समझा — आपकी मुख्य चिंता यह है कि...\"\n",
    "scriptEn": "Chemist: \"Look, my customers don't really care about fancy packaging.\"\n\n(Pause — 3 seconds of silence)\n\nYou: \"Don't care about packaging?\" (Echo)\n\nChemist: \"Well, they just want their medicines quickly.\"\n\nYou: \"So speed of service matters most to your customers — is that what I'm hearing?\" (Summary)\n\nChemist: \"Yes, exactly.\"\n\nYou: \"That makes total sense. And actually, that's exactly why our branded pouches help — patients who can find your phone number quickly on the pouch call YOU directly next time instead of going to a different store. Your number is right there on every pouch.\"\n",
    "scriptHi": "केमिस्ट: \"देखिए, मेरे ग्राहकों को फैंसी पैकेजिंग की परवाह नहीं है।\"\n\n(Pause — 3 सेकंड की चुप्पी)\n\nआप: \"पैकेजिंग की परवाह नहीं?\" (Echo)\n\nकेमिस्ट: \"वे बस जल्दी अपनी दवाइयाँ चाहते हैं।\"\n\nआप: \"तो आपके ग्राहकों के लिए सेवा की गति सबसे ज़रूरी है — क्या मैं यह सही सुन रहा हूँ?\" (Summary)\n\nकेमिस्ट: \"हाँ, बिल्कुल।\"\n\nआप: \"यह पूरी तरह समझ में आता है। और वास्तव में, इसीलिए हमारे ब्रांडेड पाउच मदद करते हैं — मरीज़ जो पाउच पर आपका फोन नंबर जल्दी देख सकते हैं, वे अगली बार सीधे आपको कॉल करते हैं।\"\n",
    "keyPoints": [
      "Listening is more powerful than talking in sales",
      "Level 4 listening catches what they DON'T say",
      "Echo the last 2-3 words to make them elaborate",
      "Pause 3 seconds after they speak — they add more",
      "Summarize their objection back to them"
    ],
    "questions": [
      {
        "questionEn": "What does 'Level 4 Listening' mean in sales?",
        "questionHi": "सेल्स में 'Level 4 Listening' का क्या मतलब है?",
        "options": {
          "en": [
            "Listening with headphones",
            "Listening for what the customer doesn't say",
            "Listening only to price-related statements",
            "Taking notes while listening"
          ],
          "hi": [
            "हेडफोन से सुनना",
            "ग्राहक जो नहीं कहता उसे सुनना",
            "केवल कीमत से संबंधित बयानों को सुनना",
            "सुनते समय नोट्स लेना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Level 4 listening captures the unspoken — the real objection hidden behind what they say.",
        "explanationHi": "Level 4 सुनना अनकहे को पकड़ता है — वह असली आपत्ति जो वे जो कहते हैं उसके पीछे छिपी है।"
      },
      {
        "questionEn": "When a chemist says 'my customers don't care about packaging,' what might they REALLY mean?",
        "questionHi": "जब एक केमिस्ट कहता है 'मेरे ग्राहकों को पैकेजिंग की परवाह नहीं,' वे वास्तव में क्या मतलब कर सकते हैं?",
        "options": {
          "en": [
            "Their customers genuinely don't care",
            "They don't want to spend money right now",
            "They prefer competitors",
            "They already have branded packaging"
          ],
          "hi": [
            "उनके ग्राहक वास्तव में परवाह नहीं करते",
            "वे अभी पैसे खर्च नहीं करना चाहते",
            "वे प्रतिस्पर्धियों को पसंद करते हैं",
            "उनके पास पहले से ब्रांडेड पैकेजिंग है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "'My customers don't care' is often a budget objection disguised as an opinion.",
        "explanationHi": "'मेरे ग्राहकों को परवाह नहीं' अक्सर राय के रूप में छिपी बजट आपत्ति है।"
      },
      {
        "questionEn": "The 'Echo' technique means:",
        "questionHi": "'Echo' तकनीक का मतलब है:",
        "options": {
          "en": [
            "Repeating your entire pitch",
            "Repeating the last 2-3 words of what they said as a question",
            "Copying their exact words back to them in full",
            "Asking them to repeat themselves"
          ],
          "hi": [
            "अपनी पूरी पिच दोहराना",
            "उन्होंने जो कहा उसके अंतिम 2-3 शब्दों को प्रश्न के रूप में दोहराना",
            "उनके सटीक शब्दों को पूरी तरह वापस कॉपी करना",
            "उनसे खुद को दोहराने के लिए कहना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Echo triggers the other person to elaborate without you asking a direct question.",
        "explanationHi": "Echo बिना सीधे सवाल पूछे सामने वाले को विस्तार से बताने के लिए प्रेरित करता है।"
      },
      {
        "questionEn": "Why should you pause 3 seconds after a chemist finishes speaking?",
        "questionHi": "केमिस्ट के बोलने के बाद 3 सेकंड क्यों रुकना चाहिए?",
        "options": {
          "en": [
            "To seem more professional",
            "They often add valuable information in that silence",
            "To give yourself time to think of a price",
            "To show dominance"
          ],
          "hi": [
            "अधिक पेशेवर दिखने के लिए",
            "वे अक्सर उस चुप्पी में मूल्यवान जानकारी जोड़ते हैं",
            "कीमत सोचने का समय पाने के लिए",
            "प्रभुत्व दिखाने के लिए"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Silence after they speak creates psychological pressure to elaborate — they usually add more, revealing their true concern.",
        "explanationHi": "बोलने के बाद चुप्पी विस्तार करने का मनोवैज्ञानिक दबाव बनाती है।"
      },
      {
        "questionEn": "Dale Carnegie's core principle about making connections is:",
        "questionHi": "संबंध बनाने के बारे में Dale Carnegie का मुख्य सिद्धांत है:",
        "options": {
          "en": [
            "Talk about yourself to seem interesting",
            "Become genuinely interested in the other person",
            "Share your company's achievements first",
            "Always offer a discount to build rapport"
          ],
          "hi": [
            "दिलचस्प लगने के लिए खुद के बारे में बात करें",
            "दूसरे व्यक्ति में वास्तव में रुचि लें",
            "पहले अपनी कंपनी की उपलब्धियाँ साझा करें",
            "तालमेल बनाने के लिए हमेशा छूट दें"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Genuine interest in others is more powerful than trying to make others interested in you.",
        "explanationHi": "दूसरों में वास्तविक रुचि खुद में रुचि दिलाने की कोशिश से ज़्यादा शक्तिशाली है।"
      }
    ]
  },
  {
    "orderIndex": 4,
    "groupNumber": 1,
    "titleEn": "Building Instant Rapport in 60 Seconds",
    "titleHi": "60 सेकंड में तुरंत तालमेल बनाना",
    "sourceBook": "How to Win Friends and Influence People by Dale Carnegie",
    "difficulty": "BEGINNER",
    "estimatedMins": 9,
    "contentEn": "Rapport is the feeling of being on the same side. When a chemist feels rapport with you, price becomes less important, trust goes up, and the call lasts longer.\n\nRapport is not built by being nice. It is built by being similar.\n\nThe 5 Fastest Rapport Builders on Phone:\n\n1. Use Their Name (Correctly and Strategically)\nUse their name 2-3 times in a call — not every sentence (creepy), not never (cold). \"Sir, I hear you — and Rajesh bhai, that's actually the exact question I was hoping you'd ask.\"\n\n2. Local Identity Connection\n\"I work with a lot of medical stores in Nashik — I've seen that the kind of customers who come to stores here care a lot about the store's reputation.\" You've now made them part of a group they're proud of.\n\n3. Find Common Ground Fast\n\"You've been running this store for how long?\" If they say 15 years — \"15 years! That's real experience. You've seen so many changes in how patients buy medicine.\" Now they're talking about themselves and they feel good.\n\n4. Match Their Vocabulary\nIf they use the word \"dawa\" — use \"dawa.\" If they say \"pharma store\" not \"medical store\" — mirror that word. People feel subconscious affinity when their own words come back to them.\n\n5. The Genuine Compliment\nNot flattery. Specific observation. \"Running a pharmacy for 20 years in the same location — that tells me you're doing something right with your patients.\" This works because it's specific and believable.\n\nRapport shortcut for medicine pouches: \"I've been speaking to medical stores across Maharashtra this week and one thing that keeps coming up — the good stores are always thinking about what makes them look different. That's exactly why I thought to call you.\"\nNow they're identified as a 'good store' and they want to live up to that.",
    "contentHi": "तालमेल एक ही तरफ होने की भावना है।\n\n5 सबसे तेज़ तालमेल बनाने वाले:\n\n1. उनके नाम का उपयोग करें — कॉल में 2-3 बार, हर वाक्य में नहीं।\n2. स्थानीय पहचान संबंध — उनके शहर के बारे में कुछ विशिष्ट बताएं।\n3. जल्दी से समान आधार खोजें — उनकी दुकान कितने साल पुरानी है?\n4. उनकी शब्दावली मिलाएं — अगर वे \"दवा\" कहते हैं, आप भी \"दवा\" कहें।\n5. वास्तविक तारीफ — चापलूसी नहीं, विशिष्ट अवलोकन।\n\nमेडिसिन पाउच के लिए तालमेल शॉर्टकट: \"मैं इस हफ्ते महाराष्ट्र के मेडिकल स्टोर से बात कर रहा हूँ और एक बात बार-बार आती है — अच्छी दुकानें हमेशा सोचती हैं कि उन्हें क्या अलग बनाता है।\"\n",
    "scriptEn": "You: \"Hello, am I speaking with Rajesh bhai?\"\nChemist: \"Yes, speaking.\"\nYou: \"Rajesh bhai, quick question — how long have you been running your store?\"\nChemist: \"About 18 years.\"\nYou: \"18 years! That's serious commitment. You've seen how the whole medical retail business has changed — patients today are so much more aware, right?\"\nChemist: \"Yes, absolutely.\"\nYou: \"That awareness is exactly why I called stores like yours specifically. Stores that have been around that long are the ones thinking about their brand, their reputation. I work with medical stores on branded packaging — and it fits exactly what experienced stores like yours are already moving toward. Can I take 2 minutes?\"\n",
    "scriptHi": "आप: \"नमस्ते, क्या मैं Rajesh bhai से बात कर रहा हूँ?\"\nकेमिस्ट: \"हाँ, बोलिए।\"\nआप: \"Rajesh bhai, एक छोटा सवाल — आप अपनी दुकान कितने समय से चला रहे हैं?\"\nकेमिस्ट: \"लगभग 18 साल।\"\nआप: \"18 साल! यह गंभीर प्रतिबद्धता है। आपने देखा है कि पूरा मेडिकल रिटेल व्यवसाय कैसे बदल गया है — आज मरीज़ बहुत अधिक जागरूक हैं, है ना?\"\nकेमिस्ट: \"हाँ, बिल्कुल।\"\nआप: \"यही जागरूकता है जिसके लिए मैंने विशेष रूप से आप जैसी दुकानों को कॉल किया। जो दुकानें इतने समय से हैं वे अपने ब्रांड के बारे में सोच रही हैं। 2 मिनट ले सकता हूँ?\"\n",
    "keyPoints": [
      "Use their name 2-3 times strategically",
      "Local identity creates instant common ground",
      "Match their exact vocabulary",
      "Specific compliments beat general flattery",
      "Identify them as part of a 'good store' group"
    ],
    "questions": [
      {
        "questionEn": "How many times should you use a chemist's name in a call for maximum rapport?",
        "questionHi": "अधिकतम तालमेल के लिए एक कॉल में आपको केमिस्ट का नाम कितनी बार इस्तेमाल करना चाहिए?",
        "options": {
          "en": [
            "Once at the beginning only",
            "2-3 times strategically",
            "Every sentence",
            "Never — it sounds fake"
          ],
          "hi": [
            "शुरुआत में केवल एक बार",
            "रणनीतिक रूप से 2-3 बार",
            "हर वाक्य में",
            "कभी नहीं — यह नकली लगता है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "2-3 times feels natural and personal. Every sentence feels creepy. Never feels cold.",
        "explanationHi": "2-3 बार स्वाभाविक और व्यक्तिगत लगता है।"
      },
      {
        "questionEn": "The 'Local Identity Connection' technique works because:",
        "questionHi": "'Local Identity Connection' तकनीक काम करती है क्योंकि:",
        "options": {
          "en": [
            "It shows you know geography",
            "People feel pride in being part of a local group",
            "It makes you seem trustworthy",
            "It reduces call length"
          ],
          "hi": [
            "यह दिखाता है कि आप भूगोल जानते हैं",
            "लोग एक स्थानीय समूह का हिस्सा होने पर गर्व महसूस करते हैं",
            "यह आपको भरोसेमंद बनाता है",
            "यह कॉल की लंबाई कम करता है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "People feel subconscious pride and belonging when identified as part of a local or regional identity.",
        "explanationHi": "स्थानीय पहचान का हिस्सा बनने पर लोग अवचेतन गर्व और अपनेपन का एहसास करते हैं।"
      },
      {
        "questionEn": "If a chemist uses the word 'dawa' instead of 'medicine', you should:",
        "questionHi": "अगर एक केमिस्ट 'medicine' की जगह 'dawa' शब्द इस्तेमाल करता है, आपको:",
        "options": {
          "en": [
            "Correct them professionally",
            "Also use 'dawa' to match their vocabulary",
            "Use both words alternately",
            "Ignore it and use medical terminology"
          ],
          "hi": [
            "उन्हें पेशेवर रूप से सुधारें",
            "उनकी शब्दावली मिलाने के लिए 'दवा' भी इस्तेमाल करें",
            "दोनों शब्दों को वैकल्पिक रूप से इस्तेमाल करें",
            "इसे अनदेखा करें और चिकित्सा शब्दावली इस्तेमाल करें"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Mirroring vocabulary creates subconscious affinity — their own words coming back to them feels familiar and comfortable.",
        "explanationHi": "शब्दावली मिलाने से अवचेतन आत्मीयता बनती है।"
      },
      {
        "questionEn": "A specific compliment vs. flattery: which is more effective and why?",
        "questionHi": "विशिष्ट तारीफ बनाम चापलूसी: कौन सी अधिक प्रभावी है और क्यों?",
        "options": {
          "en": [
            "Flattery — because everyone likes to be praised",
            "Specific compliment — because it's believable and earned",
            "Neither — compliments seem fake in sales",
            "Flattery — because it makes them feel good quickly"
          ],
          "hi": [
            "चापलूसी — क्योंकि सभी को प्रशंसा पसंद है",
            "विशिष्ट तारीफ — क्योंकि यह विश्वसनीय और अर्जित है",
            "दोनों नहीं — सेल्स में तारीफ नकली लगती है",
            "चापलूसी — क्योंकि यह जल्दी अच्छा एहसास देती है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Specific compliments are believable because they reference real details. Flattery is recognized and distrusted.",
        "explanationHi": "विशिष्ट तारीफ विश्वसनीय है क्योंकि यह वास्तविक विवरण का संदर्भ देती है।"
      },
      {
        "questionEn": "The rapport shortcut 'good stores are thinking about their brand' works because:",
        "questionHi": "तालमेल शॉर्टकट 'अच्छी दुकानें अपने ब्रांड के बारे में सोच रही हैं' काम करता है क्योंकि:",
        "options": {
          "en": [
            "It's a proven statistic",
            "It identifies the chemist as a 'good store owner' and they want to live up to that label",
            "It introduces the product early",
            "It creates urgency"
          ],
          "hi": [
            "यह एक सिद्ध आँकड़ा है",
            "यह केमिस्ट को 'अच्छे दुकान मालिक' के रूप में पहचानता है और वे उस लेबल पर खरे उतरना चाहते हैं",
            "यह जल्दी प्रोडक्ट पेश करता है",
            "यह तात्कालिकता पैदा करती है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Labeling someone positively creates consistency pressure — they act in ways that match the positive label.",
        "explanationHi": "किसी को सकारात्मक रूप से लेबल करना consistency दबाव बनाता है।"
      }
    ]
  },
  {
    "orderIndex": 5,
    "groupNumber": 1,
    "titleEn": "Understanding Your Customer — The Chemist's World",
    "titleHi": "अपने ग्राहक को समझना — केमिस्ट की दुनिया",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "BEGINNER",
    "estimatedMins": 11,
    "contentEn": "Before you can sell to anyone, you must understand their world — their daily pressures, their fears, their ambitions.\n\nThe average Indian medical store owner's world:\n\nDaily Reality:\n- Serves 50-200 patients per day\n- Manages 500-5000 SKUs (medicine varieties)\n- Deals with company medical representatives every week\n- Worried about competition from online pharmacies\n- Margins are thin — average 12-18% on medicines\n- Busy from 8am to 10pm, often 7 days a week\n\nTheir Real Fears:\n- Losing regular patients to a nearby competitor\n- A patient gets the wrong medicine and complains\n- Online pharmacies (1mg, PharmEasy) stealing their customers\n- Slow-moving inventory they can't return\n\nTheir Hidden Ambitions:\n- Being the most trusted store in their locality\n- Building a loyal patient base that refers others\n- Standing out from the 5-10 competitors within 1km\n\nWhy This Matters for Medicine Pouches:\nWhen you understand their world, you stop pitching features and start solving problems.\n\nWRONG: \"Our pouches are multicolor, 70 GSM, 4 sizes available.\"\nRIGHT: \"Your patients who go to 1mg can be pulled back — every time they see your name on the pouch at home, they remember where they got their medicine. That memory is more powerful than any online ad.\"\n\nThe buying motivation map for a chemist:\n- Reputation → Branded packaging answers this\n- Patient retention → Your number on their pouch answers this\n- Competition differentiation → Multicolor vs. plain brown answers this\n- Trust → GST invoice, pan-India presence answers this",
    "contentHi": "मेडिकल स्टोर मालिक की दैनिक वास्तविकता:\n- रोज़ 50-200 मरीज़ों की सेवा\n- 500-5000 SKUs प्रबंधित करता है\n- हर हफ्ते कंपनी MRs से मिलता है\n- ऑनलाइन फार्मेसी की प्रतिस्पर्धा की चिंता\n- दवाइयों पर पतले मार्जिन (12-18%)\n\nउनके असली डर:\n- नियमित मरीज़ों को प्रतिस्पर्धी को खोना\n- ऑनलाइन फार्मेसी (1mg, PharmEasy) से ग्राहक छिन जाना\n\nउनकी छिपी महत्वाकांक्षाएं:\n- अपने इलाके में सबसे भरोसेमंद दुकान बनना\n- 1km के भीतर 5-10 प्रतिस्पर्धियों से अलग दिखना\n\nकेमिस्ट के लिए खरीद प्रेरणा मानचित्र:\n- प्रतिष्ठा → ब्रांडेड पैकेजिंग\n- मरीज़ रिटेंशन → पाउच पर आपका नंबर\n- प्रतिस्पर्धा अंतर → मल्टीकलर बनाम सादा ब्राउन\n- विश्वास → GST इनवॉइस, पैन-इंडिया उपस्थिति\n",
    "scriptEn": "You: \"Sir, one thing I've been hearing from medical store owners this month — the competition from 1mg and PharmEasy is real. Are you seeing that in your area too?\"\n\nChemist: \"Yes, it's a problem. Younger patients especially order online.\"\n\nYou: \"Exactly. And you know what the best response is? Not price matching — because you can't beat 1mg's prices. It's building personal loyalty that an app can't replicate. When a patient has your phone number on their medicine pouch at home, they call YOU. Not 1mg. Not a search engine. You. That's what branded packaging does for a store like yours.\"\n",
    "scriptHi": "आप: \"सर, इस महीने मैं मेडिकल स्टोर मालिकों से एक बात सुन रहा हूँ — 1mg और PharmEasy से प्रतिस्पर्धा वास्तविक है। क्या आप अपने क्षेत्र में यह देख रहे हैं?\"\n\nकेमिस्ट: \"हाँ, यह एक समस्या है। विशेष रूप से युवा मरीज़ ऑनलाइन ऑर्डर करते हैं।\"\n\nआप: \"बिल्कुल। और आपको पता है सबसे अच्छी प्रतिक्रिया क्या है? कीमत मिलाना नहीं — क्योंकि आप 1mg की कीमतों को मात नहीं दे सकते। यह व्यक्तिगत वफादारी बनाना है। जब एक मरीज़ के घर पर उनके मेडिसिन पाउच पर आपका फोन नंबर है, वे आपको कॉल करते हैं। यही ब्रांडेड पैकेजिंग करती है।\"\n",
    "keyPoints": [
      "Understand the chemist's daily world before pitching",
      "Their core fear is losing patients to competition",
      "Online pharmacies are a relatable pain point",
      "Branded pouches directly address patient retention",
      "Match your solution to their specific motivation"
    ],
    "questions": [
      {
        "questionEn": "What is the average margin a medical store owner makes on medicines?",
        "questionHi": "एक मेडिकल स्टोर मालिक को दवाइयों पर औसत मार्जिन क्या है?",
        "options": {
          "en": [
            "5-8%",
            "12-18%",
            "25-30%",
            "40-50%"
          ],
          "hi": [
            "5-8%",
            "12-18%",
            "25-30%",
            "40-50%"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Medical store margins on medicines are typically 12-18%, making every additional revenue source important.",
        "explanationHi": "मेडिकल स्टोर का दवाइयों पर मार्जिन आमतौर पर 12-18% होता है।"
      },
      {
        "questionEn": "Which online pharmacy competition is MOST relatable to bring up with chemists?",
        "questionHi": "केमिस्ट के साथ उठाने के लिए कौन सी ऑनलाइन फार्मेसी प्रतिस्पर्धा सबसे अधिक प्रासंगिक है?",
        "options": {
          "en": [
            "Amazon",
            "1mg and PharmEasy",
            "Flipkart",
            "Myntra"
          ],
          "hi": [
            "Amazon",
            "1mg और PharmEasy",
            "Flipkart",
            "Myntra"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "1mg and PharmEasy are the dominant online pharmacy platforms that directly compete with local medical stores.",
        "explanationHi": "1mg और PharmEasy प्रमुख ऑनलाइन फार्मेसी प्लेटफॉर्म हैं जो सीधे लोकल मेडिकल स्टोर से प्रतिस्पर्धा करते हैं।"
      },
      {
        "questionEn": "A chemist's PRIMARY hidden ambition is usually:",
        "questionHi": "एक केमिस्ट की प्राथमिक छिपी महत्वाकांक्षा आमतौर पर होती है:",
        "options": {
          "en": [
            "Expanding to multiple locations",
            "Being the most trusted store in their locality",
            "Becoming a wholesale distributor",
            "Hiring more staff"
          ],
          "hi": [
            "कई स्थानों पर विस्तार करना",
            "अपने इलाके में सबसे भरोसेमंद दुकान बनना",
            "थोक वितरक बनना",
            "अधिक कर्मचारी रखना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Most independent pharmacy owners want to be the most trusted, most-referred store in their immediate locality.",
        "explanationHi": "अधिकांश स्वतंत्र फार्मेसी मालिक अपने इलाके में सबसे भरोसेमंद दुकान बनना चाहते हैं।"
      },
      {
        "questionEn": "Why is 'features pitching' (70 GSM, 4 sizes, multicolor) less effective than problem solving?",
        "questionHi": "'फीचर पिचिंग' (70 GSM, 4 साइज, मल्टीकलर) समस्या समाधान से कम प्रभावी क्यों है?",
        "options": {
          "en": [
            "Features are too technical",
            "Chemists don't care about specs",
            "Features don't connect to the chemist's real fears and ambitions",
            "Features are confusing"
          ],
          "hi": [
            "फीचर बहुत तकनीकी हैं",
            "केमिस्ट स्पेसिफिकेशन की परवाह नहीं करते",
            "फीचर केमिस्ट के असली डर और महत्वाकांक्षाओं से नहीं जुड़ते",
            "फीचर भ्रमित करने वाले हैं"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Features answer 'what is it?' but not 'why should I care?' Problem solving connects directly to their fears and goals.",
        "explanationHi": "फीचर 'यह क्या है?' का जवाब देते हैं लेकिन 'मुझे क्यों परवाह करनी चाहिए?' का नहीं।"
      },
      {
        "questionEn": "The best way to counter the online pharmacy threat when pitching medicine pouches is:",
        "questionHi": "मेडिसिन पाउच पिच करते समय ऑनलाइन फार्मेसी खतरे का मुकाबला करने का सबसे अच्छा तरीका है:",
        "options": {
          "en": [
            "Tell them online pharmacies are illegal",
            "Offer to price-match online rates",
            "Show how branded pouches build personal loyalty that apps cannot replicate",
            "Ignore the topic"
          ],
          "hi": [
            "उन्हें बताएं कि ऑनलाइन फार्मेसी अवैध हैं",
            "ऑनलाइन दरों से मूल्य मिलाने की पेशकश करें",
            "दिखाएं कि ब्रांडेड पाउच व्यक्तिगत वफादारी बनाते हैं जो ऐप्स नहीं बना सकते",
            "विषय को अनदेखा करें"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Branded pouches build a personal connection that no app can replicate — patient sees your number daily at home.",
        "explanationHi": "ब्रांडेड पाउच व्यक्तिगत संबंध बनाते हैं जो कोई ऐप नहीं बना सकता।"
      }
    ]
  },
  {
    "orderIndex": 6,
    "groupNumber": 2,
    "titleEn": "The Power of Preparation — Know Before You Call",
    "titleHi": "तैयारी की शक्ति — कॉल से पहले जानें",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "BEGINNER",
    "estimatedMins": 8,
    "contentEn": "Top salespeople spend 20% of their time preparing and 80% calling. Average salespeople do the opposite.\n\nWhat to know before calling a chemist:\n1. Area/locality: Is it a high-footfall market or residential lane? Urban or semi-urban?\n2. Store size clue: Search on Google Maps — how many reviews? More reviews = busier store = bigger decision maker.\n3. Timing: Best times to call chemists are 11am-1pm and 3pm-5pm. Avoid Mondays (busiest) and Sundays.\n4. Their current packaging: If you've done nearby area before — mention it. \"We supply to a store 2 lanes from yours.\"\n\nThe Preparation Script Framework:\n- WHO: Who am I calling? (Name from reference/list)\n- WHAT: What do they probably need? (Which objection am I likely to face?)\n- WHY TODAY: Why would they listen now? (Peak season? Festival orders?)\n- HOOK: What is my one-line value statement tailored to them?\n\nFor medicine pouch sales specifically:\nFestival season (Diwali, Navratri, New Year) = perfect time to pitch. \"Most stores we work with increase their reorder before festival season — patients buy more medicines as gifts for elderly relatives.\"\n\nPre-call checklist:\n☐ Name of owner (not just 'sir')\n☐ Area of store\n☐ Best time to call based on location type\n☐ One relatable local reference point\n☐ Primary objection I expect + my response ready",
    "contentHi": "टॉप सेल्सपर्सन 20% समय तैयारी में और 80% कॉलिंग में लगाते हैं।\n\nकॉल से पहले क्या जानना है:\n1. क्षेत्र/इलाका: उच्च-फुटफॉल बाज़ार या आवासीय लेन?\n2. स्टोर का आकार: Google Maps पर कितनी reviews?\n3. समय: केमिस्ट को कॉल करने का सबसे अच्छा समय 11am-1pm और 3pm-5pm।\n4. मौजूदा पैकेजिंग: क्या आपने पास में पहले काम किया है?\n\nतैयारी स्क्रिप्ट फ्रेमवर्क:\n- WHO: मैं किसे कॉल कर रहा हूँ?\n- WHAT: उन्हें शायद क्या चाहिए?\n- WHY TODAY: वे अभी क्यों सुनेंगे?\n- HOOK: उनके लिए मेरा एक-लाइन वैल्यू स्टेटमेंट?\n\nत्योहारी सीज़न (दिवाली, नवरात्रि, नया साल) = पिच करने का सही समय।",
    "scriptEn": "Before calling a medical store in Nagpur's Sitabuldi market:\n\nPreparation: High-footfall commercial area, likely 100+ patients/day, competitive locality with multiple pharmacies.\n\nOpening: \"Hello, is this the owner of [Store Name]? I'm calling specifically for Sitabuldi stores this week — we've just completed a batch for two stores in your market and I wanted to check if you'd want your next batch ready before Navratri.\"\n\nWhy this works: You've shown you know their market, you've created social proof (other stores in their area), and you've used a seasonal hook.\n",
    "scriptHi": "Nagpur के Sitabuldi बाज़ार में एक मेडिकल स्टोर को कॉल करने से पहले:\n\nतैयारी: उच्च-फुटफॉल व्यावसायिक क्षेत्र, संभवतः 100+ मरीज़/दिन।\n\nओपनिंग: \"नमस्ते, क्या यह [स्टोर नाम] के मालिक हैं? मैं इस हफ्ते विशेष रूप से Sitabuldi स्टोर के लिए कॉल कर रहा हूँ — हमने अभी आपके बाज़ार में दो दुकानों के लिए एक बैच पूरा किया है और मैं देखना चाहता था कि क्या आप नवरात्रि से पहले अपना अगला बैच तैयार कराना चाहेंगे।\"\n",
    "keyPoints": [
      "Prepare WHO/WHAT/WHY/HOOK before every call",
      "Best call times: 11am-1pm and 3pm-5pm",
      "Avoid Mondays and Sundays",
      "Use Google Maps reviews to gauge store size",
      "Festival season is perfect pitch timing"
    ],
    "questions": [
      {
        "questionEn": "What is the ideal time window to call a chemist?",
        "questionHi": "केमिस्ट को कॉल करने का आदर्श समय खिड़की क्या है?",
        "options": {
          "en": [
            "7am-9am",
            "11am-1pm and 3pm-5pm",
            "2pm-3pm",
            "After 8pm"
          ],
          "hi": [
            "7am-9am",
            "11am-1pm और 3pm-5pm",
            "2pm-3pm",
            "रात 8 बजे के बाद"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "11am-1pm and 3pm-5pm are typically less busy for medical stores — morning rush and evening rush are avoided.",
        "explanationHi": "11am-1pm और 3pm-5pm मेडिकल स्टोर के लिए कम व्यस्त होते हैं।"
      },
      {
        "questionEn": "Using Google Maps reviews before calling a chemist helps you understand:",
        "questionHi": "कॉल से पहले Google Maps reviews का उपयोग करने से आप समझ सकते हैं:",
        "options": {
          "en": [
            "Their pricing strategy",
            "The approximate size and footfall of the store",
            "Their competitor list",
            "Whether they use branded packaging"
          ],
          "hi": [
            "उनकी मूल्य निर्धारण रणनीति",
            "स्टोर का अनुमानित आकार और फुटफॉल",
            "उनकी प्रतिस्पर्धी सूची",
            "क्या वे ब्रांडेड पैकेजिंग इस्तेमाल करते हैं"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "More Google Maps reviews generally indicate higher footfall and a more established store.",
        "explanationHi": "अधिक Google Maps reviews आमतौर पर उच्च फुटफॉल और अधिक स्थापित स्टोर का संकेत देते हैं।"
      },
      {
        "questionEn": "Why is festival season the best time to pitch medicine pouches?",
        "questionHi": "मेडिसिन पाउच पिच करने के लिए त्योहारी सीज़न सबसे अच्छा समय क्यों है?",
        "options": {
          "en": [
            "Chemists are less busy",
            "Patients buy more medicines and the store needs extra packaging",
            "Printing costs are lower",
            "Delivery is faster"
          ],
          "hi": [
            "केमिस्ट कम व्यस्त होते हैं",
            "मरीज़ अधिक दवाइयाँ खरीदते हैं और दुकान को अतिरिक्त पैकेजिंग चाहिए",
            "प्रिंटिंग लागत कम होती है",
            "डिलीवरी तेज़ होती है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Festival season increases medicine sales as patients gift health products to elderly relatives, driving packaging demand.",
        "explanationHi": "त्योहारी सीज़न में दवाइयों की बिक्री बढ़ती है क्योंकि मरीज़ बुजुर्ग रिश्तेदारों को स्वास्थ्य उत्पाद उपहार में देते हैं।"
      },
      {
        "questionEn": "The HOOK in the preparation framework is:",
        "questionHi": "तैयारी फ्रेमवर्क में HOOK है:",
        "options": {
          "en": [
            "Your product's price",
            "Your one-line value statement tailored to this specific customer",
            "Your company introduction",
            "Your MOQ details"
          ],
          "hi": [
            "आपके प्रोडक्ट की कीमत",
            "इस विशिष्ट ग्राहक के लिए आपका एक-लाइन वैल्यू स्टेटमेंट",
            "आपकी कंपनी का परिचय",
            "आपके MOQ विवरण"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "The hook is your tailored, one-line reason why THIS specific customer should care about your call.",
        "explanationHi": "HOOK आपका कस्टमाइज़ेड, एक-लाइन कारण है कि यह विशिष्ट ग्राहक आपकी कॉल की परवाह क्यों करे।"
      },
      {
        "questionEn": "Mentioning 'we supply to a store 2 lanes from yours' is an example of:",
        "questionHi": "'हम आपसे 2 गलियाँ दूर एक दुकान को सप्लाई करते हैं' का उल्लेख करना एक उदाहरण है:",
        "options": {
          "en": [
            "Price anchoring",
            "Local social proof",
            "Feature selling",
            "Authority building"
          ],
          "hi": [
            "प्राइस एंकरिंग",
            "स्थानीय सामाजिक प्रमाण",
            "फीचर सेलिंग",
            "अथॉरिटी बिल्डिंग"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Local social proof is powerful — if a nearby competitor is already using it, the chemist doesn't want to be left behind.",
        "explanationHi": "स्थानीय सामाजिक प्रमाण शक्तिशाली है — अगर पास का प्रतिस्पर्धी पहले से इसका उपयोग कर रहा है, तो केमिस्ट पीछे नहीं रहना चाहता।"
      }
    ]
  },
  {
    "orderIndex": 7,
    "groupNumber": 2,
    "titleEn": "The Art of the Follow-Up — Why Most Sales Happen After No",
    "titleHi": "फॉलो-अप की कला — क्यों ज़्यादातर सेल्स 'नहीं' के बाद होती हैं",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "BEGINNER",
    "estimatedMins": 10,
    "contentEn": "Research shows that 80% of sales require 5 or more follow-ups. Yet 44% of salespeople give up after 1 follow-up. This is the single biggest missed opportunity in sales.\n\nWhy most salespeople don't follow up:\n- Fear of rejection (\"they already said no\")\n- No system to track who to call when\n- They assume \"if they were interested, they'd call me\"\n\nThe Follow-Up Mindset Shift:\n\"No\" in sales is almost always \"not yet.\" The chemist who said \"send me information on WhatsApp\" and never responded isn't saying never. They're saying \"I'm busy, remind me.\"\n\nThe 5-Touch Follow-Up System for Medicine Pouches:\n\nTouch 1 (Day 0): The call — introduce, get interest or objection\nTouch 2 (Day 1): WhatsApp — send sample design image + one-line value\nTouch 3 (Day 3): WhatsApp follow-up — \"Sir, did you get a chance to look?\"\nTouch 4 (Day 7): Call — \"Sir, we're starting a new batch this week, wanted to confirm if you'd like to join\"\nTouch 5 (Day 14): Final call — \"Sir, last check — your area customers are starting to see branded pouches from other stores. Wanted to give you first right before we confirm their reorder.\"\n\nEach touch has a different angle — not the same message repeated. Repeat = annoying. New angle = valuable.\n\nThe magic number: Studies show 80% of closed deals happen between touch 5 and touch 12. Most salespeople stop at touch 2.",
    "contentHi": "रिसर्च दिखाती है कि 80% सेल्स के लिए 5 या अधिक फॉलो-अप की ज़रूरत होती है। लेकिन 44% सेल्सपर्सन 1 फॉलो-अप के बाद छोड़ देते हैं।\n\n5-टच फॉलो-अप सिस्टम:\nTouch 1 (दिन 0): कॉल — परिचय, रुचि या आपत्ति\nTouch 2 (दिन 1): WhatsApp — सैम्पल डिज़ाइन + एक-लाइन वैल्यू\nTouch 3 (दिन 3): WhatsApp फॉलो-अप — \"सर, क्या आपको देखने का मौका मिला?\"\nTouch 4 (दिन 7): कॉल — \"सर, हम इस हफ्ते नया बैच शुरू कर रहे हैं\"\nTouch 5 (दिन 14): अंतिम कॉल — \"सर, आखिरी चेक — आपके क्षेत्र के ग्राहक दूसरी दुकानों से ब्रांडेड पाउच देखने लगे हैं।\"\n\nजादुई संख्या: 80% बंद डील Touch 5 और Touch 12 के बीच होती हैं।",
    "scriptEn": "Touch 2 (Day 1 WhatsApp):\n\"Hello [Name] bhai, Rahul here from RarePrint — spoke yesterday. Sending a quick sample of what your pharmacy name could look like on our pouch. [Image] What do you think? Just one word — like/dislike? 😊\"\n\nTouch 4 (Day 7 Call):\n\"Hello sir, Rahul here. We spoke last week about the medicine pouches. We're starting a production batch this week and have a few open slots — I remembered your store and wanted to check if you'd want to lock in your design before we start.\"\n\nTouch 5 (Day 14 Call):\n\"Sir, last call from my side — I don't want to bother you more than this. One thing I wanted you to know: we've now confirmed orders from 3 stores in your area this month. Once those start circulating, patients will start comparing. Wanted to give you the option first.\"\n",
    "scriptHi": "Touch 2 (दिन 1 WhatsApp):\n\"नमस्ते [नाम] भाई, Rahul यहाँ RarePrint से — कल बात हुई थी। जल्दी से एक सैम्पल भेज रहा हूँ कि हमारे पाउच पर आपकी फार्मेसी का नाम कैसा दिख सकता है। [Image] क्या लगता है? बस एक शब्द — पसंद/नापसंद? 😊\"\n\nTouch 4 (दिन 7 कॉल):\n\"नमस्ते सर, Rahul यहाँ। हम इस हफ्ते प्रोडक्शन बैच शुरू कर रहे हैं और कुछ खुले स्लॉट हैं — मुझे आपकी दुकान याद आई।\"\n\nTouch 5 (दिन 14 कॉल):\n\"सर, मेरी तरफ से आखिरी कॉल — हमने इस महीने आपके क्षेत्र की 3 दुकानों से ऑर्डर कन्फर्म किए हैं। एक बार वे सर्कुलेट होने लगें, मरीज़ तुलना करना शुरू कर देंगे।\"\n",
    "keyPoints": [
      "80% of sales need 5+ follow-ups",
      "44% of salespeople quit after 1 follow-up",
      "Each follow-up should have a NEW angle",
      "'No' almost always means 'not yet'",
      "WhatsApp sample images are powerful touch 2"
    ],
    "questions": [
      {
        "questionEn": "What percentage of sales require 5 or more follow-ups?",
        "questionHi": "कितने प्रतिशत सेल्स के लिए 5 या अधिक फॉलो-अप की ज़रूरत होती है?",
        "options": {
          "en": [
            "20%",
            "50%",
            "80%",
            "95%"
          ],
          "hi": [
            "20%",
            "50%",
            "80%",
            "95%"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Research consistently shows 80% of sales require 5+ follow-ups, yet most salespeople stop after 1-2.",
        "explanationHi": "रिसर्च लगातार दिखाती है कि 80% सेल्स के लिए 5+ फॉलो-अप की ज़रूरत होती है।"
      },
      {
        "questionEn": "What is the best Touch 2 action after a medicine pouch call?",
        "questionHi": "मेडिसिन पाउच कॉल के बाद सबसे अच्छी Touch 2 क्रिया क्या है?",
        "options": {
          "en": [
            "Call again the same day",
            "Send a WhatsApp message with a sample design image",
            "Email a brochure",
            "Visit in person"
          ],
          "hi": [
            "उसी दिन फिर कॉल करें",
            "सैम्पल डिज़ाइन इमेज के साथ WhatsApp संदेश भेजें",
            "ब्रोशर ईमेल करें",
            "व्यक्तिगत रूप से जाएं"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "A WhatsApp sample design is visual, immediate, and gives them something tangible to react to.",
        "explanationHi": "WhatsApp सैम्पल डिज़ाइन विज़ुअल, तत्काल है और उन्हें प्रतिक्रिया देने के लिए कुछ ठोस देता है।"
      },
      {
        "questionEn": "Why should each follow-up touch have a DIFFERENT angle?",
        "questionHi": "प्रत्येक फॉलो-अप touch का अलग कोण क्यों होना चाहिए?",
        "options": {
          "en": [
            "To confuse the customer",
            "Repeating the same message is annoying; a new angle adds value",
            "To test different scripts",
            "To show product variety"
          ],
          "hi": [
            "ग्राहक को भ्रमित करने के लिए",
            "एक ही संदेश दोहराना परेशान करने वाला है; नया कोण मूल्य जोड़ता है",
            "अलग-अलग स्क्रिप्ट टेस्ट करने के लिए",
            "प्रोडक्ट विविधता दिखाने के लिए"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Each follow-up should bring new value or new information — not just 'checking in', which sounds desperate.",
        "explanationHi": "प्रत्येक फॉलो-अप को नई वैल्यू या नई जानकारी लानी चाहिए।"
      },
      {
        "questionEn": "In the 5-touch system, the Touch 5 medicine pouch message uses which psychological trigger?",
        "questionHi": "5-touch सिस्टम में, Touch 5 मेडिसिन पाउच संदेश कौन सा मनोवैज्ञानिक ट्रिगर इस्तेमाल करता है?",
        "options": {
          "en": [
            "Reciprocity",
            "Social proof combined with local scarcity",
            "Authority",
            "Commitment"
          ],
          "hi": [
            "Reciprocity",
            "स्थानीय कमी के साथ संयुक्त सामाजिक प्रमाण",
            "Authority",
            "Commitment"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "'3 stores in your area already ordered' combines social proof (others are doing it) with local scarcity (you'll be left behind).",
        "explanationHi": "'आपके क्षेत्र की 3 दुकानों ने ऑर्डर किया' सामाजिक प्रमाण को स्थानीय कमी के साथ जोड़ता है।"
      },
      {
        "questionEn": "A chemist who said 'send me information' and didn't respond is:",
        "questionHi": "एक केमिस्ट जिसने 'जानकारी भेजिए' कहा और जवाब नहीं दिया:",
        "options": {
          "en": [
            "Definitely not interested",
            "Saying 'not yet' — too busy to respond, but not a definite no",
            "Waiting for a discount offer",
            "Testing your persistence"
          ],
          "hi": [
            "निश्चित रूप से रुचि नहीं है",
            "'अभी नहीं' कह रहा है — जवाब देने के लिए बहुत व्यस्त, लेकिन निश्चित नहीं",
            "डिस्काउंट ऑफर का इंतज़ार कर रहा है",
            "आपकी दृढ़ता का परीक्षण कर रहा है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "'Send me info' is a soft deferral, not a rejection. The 5-touch system is designed exactly for these situations.",
        "explanationHi": "'जानकारी भेजिए' एक नरम टालमटोल है, अस्वीकृति नहीं।"
      }
    ]
  },
  {
    "orderIndex": 8,
    "groupNumber": 2,
    "titleEn": "WhatsApp Selling — India's Most Powerful Sales Tool",
    "titleHi": "WhatsApp सेलिंग — भारत का सबसे शक्तिशाली सेल्स टूल",
    "sourceBook": "Sell or Be Sold by Grant Cardone",
    "difficulty": "BEGINNER",
    "estimatedMins": 9,
    "contentEn": "India has 500+ million WhatsApp users. For medical store sales, WhatsApp is more powerful than email, more personal than a brochure, and more visual than a phone call.\n\nThe 7 Rules of WhatsApp Selling for Medicine Pouches:\n\nRule 1: Always introduce before sending\nNever send a design or catalog cold. First message: \"Hello [Name] bhai, Rahul here from RarePrint — we spoke today about the medicine pouches. May I share a quick sample design?\"\n\nRule 2: One message, one idea\nDon't dump catalog + price + specs + MOQ in one message. One message = one hook.\n\nRule 3: The visual is the pitch\nA well-designed mockup of THEIR pharmacy name on YOUR pouch is worth 1000 words. Create it before the call. Send it in Touch 2.\n\nRule 4: End every message with one easy action\n\"What do you think?\" \"Which size would work for you?\" Never end with no call to action.\n\nRule 5: Voice notes over text for warm follow-ups\nA 30-second voice note in their language (Hindi/Marathi/local) creates 10x more warmth than a typed message. \"Bhai, Rahul here, just wanted to personally check if you had a minute to look at the sample I sent...\"\n\nRule 6: The 3-day rule\nIf they don't respond to your WhatsApp in 3 days, follow up once. If no response after 5 days, call them.\n\nRule 7: The catalogue approach\nSend a clean 3-slide catalogue: Slide 1 — sample design with their name. Slide 2 — 4 sizes with dimensions. Slide 3 — MOQ, price range, GST invoice, delivery time.\nNever more than 3 slides — overwhelm = no decision.",
    "contentHi": "भारत में 500+ मिलियन WhatsApp उपयोगकर्ता हैं।\n\nमेडिसिन पाउच के लिए WhatsApp सेलिंग के 7 नियम:\n\nनियम 1: भेजने से पहले हमेशा परिचय दें\nनियम 2: एक संदेश, एक विचार\nनियम 3: विज़ुअल ही पिच है — उनकी फार्मेसी के नाम का मॉकअप\nनियम 4: हर संदेश एक आसान क्रिया के साथ समाप्त करें\nनियम 5: गर्म फॉलो-अप के लिए टेक्स्ट की जगह वॉयस नोट\nनियम 6: 3-दिन का नियम\nनियम 7: 3-स्लाइड कैटलॉग — अधिक नहीं\n",
    "scriptEn": "WhatsApp Message Sequence:\n\nDay 0 (after call):\n\"Hello Rajesh bhai 🙏 Rahul here from RarePrint — we spoke just now about medicine pouches. With your permission, may I share a sample design I've made for your pharmacy? (2 seconds to look 😊)\"\n\n(They say yes or don't reply)\n\nDay 1 (send design):\n[Image of their pharmacy name on pouch mockup]\n\"This is how your pharmacy name would look on our 4x5 pouch. 70 GSM, multicolor front & back. What do you think? Like/Dislike?\"\n\nDay 3 (if no reply):\n[Voice note, 25 seconds, in their language]:\n\"Bhai, Rahul here from RarePrint. Just checking if you got the design I sent. If you saw it and liked it, we could move forward — if not, tell me what to change. Your feedback matters more than a yes!\"\n",
    "scriptHi": "WhatsApp संदेश अनुक्रम:\n\nदिन 0 (कॉल के बाद):\n\"नमस्ते Rajesh bhai 🙏 Rahul यहाँ RarePrint से — अभी मेडिसिन पाउच के बारे में बात हुई। क्या मैं आपकी फार्मेसी के लिए बनाया गया एक सैम्पल डिज़ाइन शेयर कर सकता हूँ?\"\n\nदिन 1 (डिज़ाइन भेजें):\n[पाउच मॉकअप पर उनकी फार्मेसी के नाम की इमेज]\n\"यह है कि आपका फार्मेसी नाम हमारे 4x5 पाउच पर कैसा दिखेगा। क्या लगता है? पसंद/नापसंद?\"\n\nदिन 3 (अगर कोई जवाब नहीं):\n[वॉयस नोट, 25 सेकंड]:\n\"भाई, Rahul यहाँ RarePrint से। बस चेक करने के लिए कि क्या आपको मेरे भेजे डिज़ाइन का मौका मिला।\"\n",
    "keyPoints": [
      "Always introduce before WhatsApp cold message",
      "One message = one idea, not a data dump",
      "Pharmacy name mockup is the most powerful visual",
      "Voice notes create 10x more warmth than text",
      "3-slide max catalogue — more = overwhelm"
    ],
    "questions": [
      {
        "questionEn": "What should the FIRST WhatsApp message to a new chemist always include?",
        "questionHi": "एक नए केमिस्ट को पहले WhatsApp संदेश में हमेशा क्या शामिल होना चाहिए?",
        "options": {
          "en": [
            "Your full product catalogue",
            "Introduction and permission to share information",
            "Pricing details",
            "MOQ and delivery timeline"
          ],
          "hi": [
            "आपका पूरा प्रोडक्ट कैटलॉग",
            "परिचय और जानकारी शेयर करने की अनुमति",
            "मूल्य निर्धारण विवरण",
            "MOQ और डिलीवरी समयरेखा"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Cold WhatsApp without introduction feels intrusive. Permission-based opening respects the prospect.",
        "explanationHi": "बिना परिचय के WhatsApp घुसपैठिया लगता है।"
      },
      {
        "questionEn": "Why is a pharmacy name mockup on a pouch the most powerful WhatsApp visual?",
        "questionHi": "पाउच पर फार्मेसी नाम मॉकअप सबसे शक्तिशाली WhatsApp विज़ुअल क्यों है?",
        "options": {
          "en": [
            "It shows product quality",
            "It makes the abstract personal — they can immediately see their own store's identity on the product",
            "It's easier to design",
            "It shows all 4 sizes"
          ],
          "hi": [
            "यह प्रोडक्ट क्वालिटी दिखाता है",
            "यह अमूर्त को व्यक्तिगत बनाता है — वे तुरंत प्रोडक्ट पर अपनी दुकान की पहचान देख सकते हैं",
            "इसे डिज़ाइन करना आसान है",
            "यह सभी 4 साइज़ दिखाता है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Personalization makes the imaginary real. Seeing their own name on the product creates ownership psychology.",
        "explanationHi": "व्यक्तिगतकरण कल्पना को वास्तविक बनाता है। उत्पाद पर अपना नाम देखने से स्वामित्व मनोविज्ञान बनता है।"
      },
      {
        "questionEn": "Why are voice notes MORE effective than typed text for warm follow-ups?",
        "questionHi": "गर्म फॉलो-अप के लिए वॉयस नोट टाइप किए गए टेक्स्ट से अधिक प्रभावी क्यों हैं?",
        "options": {
          "en": [
            "They are faster to send",
            "Voice creates 10x more warmth and personal connection than text",
            "They are harder to ignore",
            "They contain more information"
          ],
          "hi": [
            "वे भेजने में तेज़ हैं",
            "आवाज़ टेक्स्ट की तुलना में 10 गुना अधिक गर्मजोशी और व्यक्तिगत संबंध बनाती है",
            "उन्हें अनदेखा करना कठिन है",
            "उनमें अधिक जानकारी होती है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Voice communicates emotion, warmth, and personality that text cannot. It feels like a real conversation.",
        "explanationHi": "आवाज़ भावना, गर्मजोशी और व्यक्तित्व संचारित करती है जो टेक्स्ट नहीं कर सकता।"
      },
      {
        "questionEn": "The maximum number of slides in a WhatsApp medicine pouch catalogue should be:",
        "questionHi": "WhatsApp मेडिसिन पाउच कैटलॉग में स्लाइड की अधिकतम संख्या होनी चाहिए:",
        "options": {
          "en": [
            "1",
            "3",
            "7",
            "10"
          ],
          "hi": [
            "1",
            "3",
            "7",
            "10"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "3 slides maximum: design sample, sizes, and commercial terms. More than 3 causes overwhelm and decision paralysis.",
        "explanationHi": "अधिकतम 3 स्लाइड: डिज़ाइन सैम्पल, साइज़ और व्यावसायिक शर्तें।"
      },
      {
        "questionEn": "If a chemist doesn't respond to WhatsApp after 3 days, you should:",
        "questionHi": "अगर केमिस्ट 3 दिन बाद WhatsApp का जवाब नहीं देता, तो आपको:",
        "options": {
          "en": [
            "Stop contacting them",
            "Send the catalogue again",
            "Follow up once on WhatsApp, then call after 5 days of silence",
            "Wait a month"
          ],
          "hi": [
            "उनसे संपर्क करना बंद करें",
            "कैटलॉग फिर भेजें",
            "एक बार WhatsApp पर फॉलो-अप करें, फिर 5 दिन की चुप्पी के बाद कॉल करें",
            "एक महीने इंतज़ार करें"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "3-day rule: one more WhatsApp touch. 5-day rule: switch to call. This escalation maintains contact without being intrusive.",
        "explanationHi": "3-दिन नियम: एक और WhatsApp touch। 5-दिन नियम: कॉल पर स्विच करें।"
      }
    ]
  },
  {
    "orderIndex": 9,
    "groupNumber": 2,
    "titleEn": "Handling the Gatekeeper — Getting Past the Assistant",
    "titleHi": "गेटकीपर को संभालना — सहायक के पास से गुज़रना",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "BEGINNER",
    "estimatedMins": 8,
    "contentEn": "In larger medical stores and chains, you often don't reach the owner first — you reach a pharmacist, store manager, or assistant. This is the gatekeeper.\n\nThe 3 wrong approaches:\n1. Lie: \"It's a personal call.\" — They catch it. Trust gone.\n2. Be vague: \"I'll explain to the owner.\" — They block you.\n3. Be pushy: \"I need to speak to the owner NOW.\" — Instant no.\n\nThe right approach — Make the Gatekeeper Your Ally:\n\nTechnique 1: Give Them Importance\n\"Actually, maybe you're the right person to ask — you probably know how many packets you go through per day better than anyone.\" Now they're engaged. Sometimes the gatekeeper makes the decision.\n\nTechnique 2: Be Completely Transparent\n\"I'm Rahul from RarePrint — we make branded medicine pouches. I'd love 2 minutes with the owner to show a sample. What's the best time to reach him/her directly?\" Transparency + specific ask = more respect.\n\nTechnique 3: The Name Request\n\"What's the owner's name so I can address them properly?\" You now have a name — and when you call back, you say \"Can I speak to Vikram bhai?\" instead of \"the owner\" — immediately sounds like you know them.\n\nTechnique 4: Leave Something Valuable\n\"Could you pass this to the owner?\" Then WhatsApp the store's number a sample design. When the owner sees it, they're already halfway sold — and the gatekeeper becomes your internal ambassador.\n\nRemember: In small-to-medium medical stores, the assistant often talks to the owner. A good impression on them = a referral inside the building.",
    "contentHi": "बड़े मेडिकल स्टोर और चेन में आप अक्सर पहले मालिक तक नहीं पहुँचते — आप एक फार्मासिस्ट, स्टोर मैनेजर या सहायक तक पहुँचते हैं।\n\n3 गलत तरीके:\n1. झूठ बोलना: \"यह व्यक्तिगत कॉल है।\"\n2. अस्पष्ट होना: \"मालिक को समझाऊँगा।\"\n3. ज़ोर देना: \"मुझे अभी मालिक से बात करनी है।\"\n\n4 सही तकनीकें:\n1. उन्हें महत्व दें — शायद वे सही व्यक्ति हैं\n2. पूरी तरह पारदर्शी रहें\n3. नाम का अनुरोध करें\n4. कुछ मूल्यवान छोड़ें\n",
    "scriptEn": "Gatekeeper: \"Owner is busy, what is this regarding?\"\n\nYou: \"Of course — I'm Rahul from RarePrint, we make custom medicine pouches for pharmacies. I don't want to waste anyone's time — could you tell me the owner's name so I can call at a better time? And is there a time he's usually free — morning or evening?\"\n\nGatekeeper: \"His name is Vikram sir. Evenings are better after 6.\"\n\nYou: \"Perfect — thank you so much. And actually, while I have you — you probably know the store operations well. How many medicine packets would you say you hand out in a day? Roughly?\"\n\n(Now the gatekeeper is talking. You've built rapport. They may even walk your sample to Vikram sir.)\n",
    "scriptHi": "गेटकीपर: \"मालिक व्यस्त हैं, यह किस बारे में है?\"\n\nआप: \"बिल्कुल — मैं Rahul हूँ RarePrint से, हम फार्मेसी के लिए कस्टम मेडिसिन पाउच बनाते हैं। किसी का समय बर्बाद नहीं करना चाहता — क्या आप मुझे मालिक का नाम बता सकते हैं ताकि मैं बेहतर समय पर कॉल कर सकूँ? और क्या कोई समय है जब वे आमतौर पर उपलब्ध होते हैं — सुबह या शाम?\"\n\nगेटकीपर: \"उनका नाम Vikram सर है। शाम 6 बजे के बाद बेहतर है।\"\n\nआप: \"परफेक्ट — बहुत धन्यवाद। और वास्तव में, जब मैं आपसे बात कर रहा हूँ — आप शायद स्टोर ऑपरेशन अच्छी तरह जानते हैं। आप एक दिन में कितने मेडिसिन पैकेट देते हैं? लगभग?\"\n",
    "keyPoints": [
      "Never lie to the gatekeeper — it destroys trust",
      "Make the gatekeeper feel important and valued",
      "Always ask for the owner's name directly",
      "Transparency + specific ask = more respect",
      "Leave a sample design to create internal advocacy"
    ],
    "questions": [
      {
        "questionEn": "What is the BIGGEST mistake when dealing with a gatekeeper?",
        "questionHi": "गेटकीपर के साथ व्यवहार करते समय सबसे बड़ी गलती क्या है?",
        "options": {
          "en": [
            "Introducing yourself too formally",
            "Lying about the nature of the call",
            "Speaking too fast",
            "Asking about the store's products"
          ],
          "hi": [
            "बहुत औपचारिक रूप से खुद को पेश करना",
            "कॉल की प्रकृति के बारे में झूठ बोलना",
            "बहुत तेज़ बोलना",
            "स्टोर के प्रोडक्ट के बारे में पूछना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Lying to the gatekeeper destroys trust immediately when discovered, and it often is discovered.",
        "explanationHi": "गेटकीपर से झूठ बोलना, जब पकड़ा जाता है, तुरंत विश्वास नष्ट करता है।"
      },
      {
        "questionEn": "Asking 'What's the owner's name?' from a gatekeeper is strategic because:",
        "questionHi": "गेटकीपर से 'मालिक का नाम क्या है?' पूछना रणनीतिक है क्योंकि:",
        "options": {
          "en": [
            "It shows you are professional",
            "Next time you call, using their name sounds like you already know them",
            "It creates a database",
            "It pressures the gatekeeper"
          ],
          "hi": [
            "यह दिखाता है कि आप पेशेवर हैं",
            "अगली बार जब आप कॉल करते हैं, उनका नाम उपयोग करना ऐसा लगता है जैसे आप उन्हें पहले से जानते हैं",
            "यह डेटाबेस बनाता है",
            "यह गेटकीपर पर दबाव डालता है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Using the owner's name creates familiarity and makes you sound like a known contact rather than a cold caller.",
        "explanationHi": "मालिक का नाम उपयोग करने से परिचितता बनती है।"
      },
      {
        "questionEn": "Making the gatekeeper feel important in a medicine pouch call means:",
        "questionHi": "मेडिसिन पाउच कॉल में गेटकीपर को महत्वपूर्ण महसूस कराने का मतलब है:",
        "options": {
          "en": [
            "Offering them a gift",
            "Asking them questions about store operations as if they are the expert",
            "Telling them about your product features",
            "Asking them to transfer you immediately"
          ],
          "hi": [
            "उन्हें उपहार देना",
            "उनसे स्टोर ऑपरेशन के बारे में सवाल पूछना जैसे वे विशेषज्ञ हों",
            "उन्हें अपने प्रोडक्ट फीचर के बारे में बताना",
            "उनसे तुरंत ट्रांसफर करने के लिए कहना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Treating the gatekeeper as an expert builds rapport and sometimes they become your internal advocate.",
        "explanationHi": "गेटकीपर को विशेषज्ञ के रूप में मानना तालमेल बनाता है।"
      },
      {
        "questionEn": "Leaving a sample design WhatsApp with the gatekeeper's number achieves:",
        "questionHi": "गेटकीपर के नंबर पर सैम्पल डिज़ाइन WhatsApp छोड़ना क्या हासिल करता है?",
        "options": {
          "en": [
            "Nothing useful",
            "Creates an internal advocate who may show it to the owner",
            "Wastes your design",
            "Confuses the gatekeeper"
          ],
          "hi": [
            "कुछ उपयोगी नहीं",
            "एक आंतरिक समर्थक बनाता है जो इसे मालिक को दिखा सकता है",
            "आपका डिज़ाइन बर्बाद करता है",
            "गेटकीपर को भ्रमित करता है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "The gatekeeper who receives a good impression becomes your internal ambassador, pre-selling the owner before you even speak.",
        "explanationHi": "अच्छी छाप पाने वाला गेटकीपर आपका आंतरिक राजदूत बन जाता है।"
      },
      {
        "questionEn": "The transparent approach to a gatekeeper ('I'm Rahul from RarePrint, we make branded medicine pouches') works because:",
        "questionHi": "गेटकीपर के प्रति पारदर्शी दृष्टिकोण काम करता है क्योंकि:",
        "options": {
          "en": [
            "It gives them too much information",
            "Gatekeepers respect clarity and specific requests over vague callers",
            "It shows you are confident",
            "It is legally required"
          ],
          "hi": [
            "यह उन्हें बहुत अधिक जानकारी देता है",
            "गेटकीपर अस्पष्ट कॉलर पर स्पष्टता और विशिष्ट अनुरोधों का सम्मान करते हैं",
            "यह दिखाता है कि आप आत्मविश्वासी हैं",
            "यह कानूनी रूप से आवश्यक है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Gatekeepers deal with vague callers all day. Clarity and honesty stand out and earn respect.",
        "explanationHi": "गेटकीपर पूरे दिन अस्पष्ट कॉलर से निपटते हैं। स्पष्टता और ईमानदारी अलग दिखती है।"
      }
    ]
  },
  {
    "orderIndex": 10,
    "groupNumber": 2,
    "titleEn": "The Trust Triangle — GST, Proof, and Presence",
    "titleHi": "ट्रस्ट ट्राइएंगल — GST, प्रमाण और उपस्थिति",
    "sourceBook": "Influence by Robert Cialdini",
    "difficulty": "BEGINNER",
    "estimatedMins": 9,
    "contentEn": "A chemist will only buy from someone they trust. Trust is not just about liking you — it's about believing you'll deliver what you promised.\n\nFor a new vendor relationship (which is what you are), trust must be established across 3 dimensions:\n\nThe Trust Triangle:\n1. Company Credibility (Can I trust this company?)\n2. Product Quality (Will what they deliver match what they promised?)\n3. Personal Credibility (Can I trust THIS person?)\n\nBuilding Company Credibility for RarePrint:\n- GST registered: \"We provide a proper GST invoice with every order — you can claim input credit.\"\n- Years in business: \"We've been in commercial printing since [year].\"\n- Geographic reach: \"We supply to medical stores across Maharashtra, Gujarat, and UP.\"\n- Order volume: \"We've produced over 1 crore medicine pouches in the last 3 years.\"\n\nBuilding Product Quality Trust:\n- Offer a physical sample (if local) or high-resolution printed sample images\n- \"Our 70 GSM paper is certified — I can send you the paper spec sheet.\"\n- \"Color accuracy is guaranteed — what you approve in the proof is what you get.\"\n\nBuilding Personal Credibility:\n- \"I'm the person who handles your account — you'll always reach me, not a call center.\"\n- Consistency: Call when you say you'll call. Send samples when you promise.\n- The name guarantee: \"If anything is wrong with your order, I personally ensure it's fixed.\"\n\nThe Trust Accelerator for medicine pouches:\n\"Sir, I'll make you an offer. Let me send you a physical sample of our paper and print quality — completely free, no obligation. Look at it, feel it, compare it to what you have now. If it's not better, we never need to speak again. Is that fair?\" This offer removes risk entirely and lets quality speak.\n\nTrust is built over multiple touches — the first call plants the seed, the sample waters it, the delivered order grows it.",
    "contentHi": "एक केमिस्ट केवल उससे खरीदेगा जिस पर वे भरोसा करते हैं।\n\nट्रस्ट ट्राइएंगल:\n1. कंपनी विश्वसनीयता — क्या मैं इस कंपनी पर भरोसा कर सकता हूँ?\n2. प्रोडक्ट क्वालिटी — क्या वे जो वादा करते हैं वो देंगे?\n3. व्यक्तिगत विश्वसनीयता — क्या मैं इस व्यक्ति पर भरोसा कर सकता हूँ?\n\nRarePrint के लिए कंपनी विश्वसनीयता:\n- GST पंजीकृत: \"हम हर ऑर्डर के साथ उचित GST इनवॉइस प्रदान करते हैं।\"\n- पैन-इंडिया उपस्थिति: \"हम महाराष्ट्र, गुजरात और UP में सप्लाई करते हैं।\"\n\nट्रस्ट एक्सेलेरेटर:\n\"सर, मैं आपको एक ऑफर देता हूँ। मुझे आपको हमारे पेपर और प्रिंट क्वालिटी का एक भौतिक सैम्पल भेजने दीजिए — बिल्कुल मुफ्त। अगर यह बेहतर नहीं है, तो हमें फिर कभी बात नहीं करनी।\"\n",
    "scriptEn": "You: \"Sir, I understand you're being careful — and you should be. You're trusting a new vendor with your pharmacy's name. Let me address that directly.\n\nFirst — we're GST registered, so you get a proper tax invoice, not a handwritten receipt.\nSecond — we supply to [reference store name] in your area — you can verify with them.\nThird — I'll send you a physical paper sample before you commit to anything. Feel the 70 GSM quality yourself.\nFourth — I'm Rahul, your direct contact. Not a call center. If there's any issue with your order, you call me and I sort it.\n\nFair enough?\"\n",
    "scriptHi": "आप: \"सर, मैं समझता हूँ कि आप सावधान हैं — और आपको होना चाहिए। आप अपनी फार्मेसी का नाम एक नए vendor को सौंप रहे हैं।\n\nपहला — हम GST पंजीकृत हैं, आपको उचित टैक्स इनवॉइस मिलेगा।\nदूसरा — हम आपके क्षेत्र में [संदर्भ स्टोर नाम] को सप्लाई करते हैं — आप उनसे verify कर सकते हैं।\nतीसरा — मैं आपको कुछ भी कमिट करने से पहले एक भौतिक पेपर सैम्पल भेजूँगा।\nचौथा — मैं Rahul हूँ, आपका सीधा संपर्क। कॉल सेंटर नहीं।\n\nउचित है?\"\n",
    "keyPoints": [
      "GST invoice = instant credibility booster",
      "Local reference store = most powerful trust proof",
      "Physical sample removes risk from the decision",
      "Be the direct contact, not a call center",
      "Trust builds over multiple touches, not one call"
    ],
    "questions": [
      {
        "questionEn": "Which trust-building element is MOST powerful for a chemist considering their first order?",
        "questionHi": "पहले ऑर्डर पर विचार करने वाले केमिस्ट के लिए कौन सा विश्वास-निर्माण तत्व सबसे शक्तिशाली है?",
        "options": {
          "en": [
            "Your company's social media presence",
            "A local reference store they can verify",
            "Your website",
            "Your years in business"
          ],
          "hi": [
            "आपकी कंपनी की सोशल मीडिया उपस्थिति",
            "एक स्थानीय संदर्भ स्टोर जिसे वे verify कर सकते हैं",
            "आपकी वेबसाइट",
            "व्यापार में आपके वर्ष"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "A local verifiable reference is the most credible proof — it's real, nearby, and they can call to confirm.",
        "explanationHi": "एक स्थानीय सत्यापन योग्य संदर्भ सबसे विश्वसनीय प्रमाण है।"
      },
      {
        "questionEn": "Why does offering a GST invoice build credibility for medicine pouch sales?",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए GST इनवॉइस देना विश्वसनीयता क्यों बनाता है?",
        "options": {
          "en": [
            "It makes the order tax-free",
            "It signals you are a legitimate, registered business — not a fly-by-night vendor",
            "It reduces the price",
            "It speeds up delivery"
          ],
          "hi": [
            "यह ऑर्डर को कर-मुक्त बनाता है",
            "यह संकेत देता है कि आप एक वैध, पंजीकृत व्यवसाय हैं — न कि कोई अस्थायी vendor",
            "यह कीमत कम करता है",
            "यह डिलीवरी तेज़ करता है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "GST registration signals permanence, legitimacy, and input tax credit eligibility — all credibility signals.",
        "explanationHi": "GST पंजीकरण स्थायित्व, वैधता और इनपुट टैक्स क्रेडिट पात्रता का संकेत देता है।"
      },
      {
        "questionEn": "The 'free sample, no obligation' offer is a trust accelerator because:",
        "questionHi": "'मुफ्त सैम्पल, कोई बाध्यता नहीं' ऑफर एक ट्रस्ट एक्सेलेरेटर है क्योंकि:",
        "options": {
          "en": [
            "It is expensive and shows commitment",
            "It removes all purchase risk and lets the quality speak for itself",
            "It gives you a reason to follow up",
            "It is a marketing tactic"
          ],
          "hi": [
            "यह महंगा है और प्रतिबद्धता दिखाता है",
            "यह सभी खरीद जोखिम हटाता है और क्वालिटी को खुद बोलने देता है",
            "यह फॉलो-अप का कारण देता है",
            "यह एक मार्केटिंग रणनीति है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Risk-free offers eliminate the main barrier to first engagement — fear of being disappointed.",
        "explanationHi": "जोखिम-मुक्त ऑफर पहली संलग्नता की मुख्य बाधा को समाप्त करते हैं।"
      },
      {
        "questionEn": "Being 'the direct contact, not a call center' builds which type of trust?",
        "questionHi": "'कॉल सेंटर नहीं, सीधा संपर्क' होना किस प्रकार का विश्वास बनाता है?",
        "options": {
          "en": [
            "Company credibility",
            "Product quality trust",
            "Personal credibility",
            "Authority credibility"
          ],
          "hi": [
            "कंपनी विश्वसनीयता",
            "प्रोडक्ट क्वालिटी ट्रस्ट",
            "व्यक्तिगत विश्वसनीयता",
            "अथॉरिटी विश्वसनीयता"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Personal credibility — the trust in YOU as an individual who will stand behind the order.",
        "explanationHi": "व्यक्तिगत विश्वसनीयता — आप पर विश्वास जो ऑर्डर के पीछे खड़ा होगा।"
      },
      {
        "questionEn": "Trust in sales is built primarily through:",
        "questionHi": "सेल्स में विश्वास मुख्य रूप से निर्माण होता है:",
        "options": {
          "en": [
            "A single impressive pitch",
            "Multiple consistent touches over time where you do what you say",
            "Offering the lowest price",
            "Having a big company brand"
          ],
          "hi": [
            "एक प्रभावशाली पिच",
            "समय के साथ कई consistent touches जहाँ आप जो कहते हैं वो करते हैं",
            "सबसे कम कीमत देना",
            "एक बड़ा कंपनी ब्रांड होना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Trust is the compound interest of consistency — each kept promise adds to it, each broken promise resets it.",
        "explanationHi": "विश्वास consistency का कम्पाउंड इंटरेस्ट है — प्रत्येक निभाया वादा इसमें जोड़ता है।"
      }
    ]
  },
  {
    "orderIndex": 11,
    "groupNumber": 3,
    "titleEn": "Objection: 'I Already Have a Supplier'",
    "titleHi": "आपत्ति: 'मेरे पास पहले से एक सप्लायर है'",
    "sourceBook": "The Challenger Sale",
    "difficulty": "BEGINNER",
    "estimatedMins": 9,
    "contentEn": "The 'I already have a supplier' objection is one of the most common — and most mishandled.\n\nMost salespeople respond by saying 'But we're better!' which immediately triggers an argument. No one likes being told their current choice is wrong.\n\nThe right framework — Explore, Don't Attack:\n\nStep 1: Acknowledge\n'That's great — it means you already know the value of quality packaging. Most of the stores I speak to don't have this sorted yet.'\n\nStep 2: Get curious (not competitive)\n'Can I ask — what are you currently using? Paper bags, plastic, or branded?'\n\nStep 3: Find the gap\nIf they say plain paper: 'Got it. And do those have your pharmacy name printed on them?'\nIf they say branded: 'That's great! Are they printed on both sides? What GSM?'\n\nStep 4: Introduce comparison, not replacement\n'I'm not asking you to switch right away — I'd just love to send you a sample so you have a comparison. If what we do isn't better, no conversation needed. Fair?'\n\nThis approach does 3 things:\n- Doesn't threaten their current relationship\n- Opens curiosity about gaps\n- Reframes you as an upgrade option, not a replacement threat\n\nRemember: Most 'I have a supplier' situations have gaps — wrong size, missing branding, late delivery, poor print quality. Your job is to find the gap.",
    "contentHi": "'मेरे पास पहले से एक सप्लायर है' आपत्ति सबसे आम में से एक है।\n\nसही फ्रेमवर्क — Explore, Attack नहीं:\n\nचरण 1: स्वीकार करें\nचरण 2: जिज्ञासु बनें (प्रतिस्पर्धी नहीं)\nचरण 3: अंतर खोजें\nचरण 4: प्रतिस्थापन नहीं, तुलना का परिचय दें\n\n'मैं आपसे तुरंत स्विच करने के लिए नहीं कह रहा — मैं बस एक सैम्पल भेजना चाहूँगा ताकि आपके पास तुलना हो।'",
    "scriptEn": "Chemist: 'We already have a supplier for our bags.'\n\nYou: 'That's actually a good sign — it means you already see the value in having proper packaging. Can I ask what you're currently using? Just so I understand.'\n\nChemist: 'Plain paper bags, local market.'\n\nYou: 'Got it. And those have your pharmacy name printed on them?'\n\nChemist: 'No, they're plain.'\n\nYou: 'So your packaging does the job of carrying medicine — but it doesn't carry your pharmacy's name home with the patient. That's a different thing entirely. What if I sent you one sample of how your name looks on our pouch? Compare it to what you have now — no pressure at all.'",
    "scriptHi": "केमिस्ट: 'हमारे पास पहले से बैग का एक सप्लायर है।'\n\nआप: 'यह वास्तव में अच्छा संकेत है — इसका मतलब है कि आप पहले से उचित पैकेजिंग में मूल्य देखते हैं। क्या मैं पूछ सकता हूँ कि आप अभी क्या इस्तेमाल कर रहे हैं?'\n\nकेमिस्ट: 'सादे पेपर बैग, लोकल मार्केट।'\n\nआप: 'समझ गया। और उन पर आपकी फार्मेसी का नाम छपा है?'\n\nकेमिस्ट: 'नहीं, सादे हैं।'\n\nआप: 'तो आपकी पैकेजिंग दवाई ले जाने का काम करती है — लेकिन यह मरीज़ के घर आपकी फार्मेसी का नाम नहीं ले जाती। यह बिल्कुल अलग बात है।'",
    "keyPoints": [
      "Acknowledge their current supplier positively",
      "Get curious about what they currently use",
      "Find the gap: branding, size, print quality",
      "Offer comparison, not replacement",
      "Plain bags = packaging; branded = advertising"
    ],
    "questions": [
      {
        "questionEn": "What is the core concept of 'Objection: 'I Already Have a Supplier''?",
        "questionHi": "'आपत्ति: 'मेरे पास पहले से एक सप्लायर है'' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "It's about product features only",
            "It's about applying Objection: 'I Already Have a Supplier' to build trust and close sales",
            "It's about giving discounts",
            "It's about calling more people"
          ],
          "hi": [
            "यह केवल प्रोडक्ट फीचर के बारे में है",
            "यह भरोसा बनाने और सेल बंद करने के लिए आपत्ति: 'मेरे पास पहले से एक सप्लायर है' लागू करने के बारे में है",
            "यह डिस्काउंट देने के बारे में है",
            "यह अधिक लोगों को कॉल करने के बारे में है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This topic is fundamentally about applying the principle to solve a real selling challenge.",
        "explanationHi": "यह टॉपिक मूल रूप से एक वास्तविक बिक्री चुनौती को हल करने के लिए सिद्धांत लागू करने के बारे में है।"
      },
      {
        "questionEn": "In medicine pouch sales, when should you use the 'Objection: 'I Already Have a Supplier'' technique?",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: 'मेरे पास पहले से एक सप्लायर है'' तकनीक का उपयोग कब करना चाहिए?",
        "options": {
          "en": [
            "Only at the beginning of the call",
            "Only when the customer objects",
            "Throughout the call when relevant, especially when facing resistance",
            "Only when closing"
          ],
          "hi": [
            "केवल कॉल की शुरुआत में",
            "केवल जब ग्राहक आपत्ति करे",
            "प्रतिरोध का सामना करते समय विशेष रूप से, जब प्रासंगिक हो",
            "केवल बंद करते समय"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Sales techniques are most powerful when applied contextually throughout the call.",
        "explanationHi": "सेल्स तकनीकें तब सबसे शक्तिशाली होती हैं जब पूरी कॉल में संदर्भानुसार लागू की जाती हैं।"
      },
      {
        "questionEn": "What is the first key point of 'Objection: 'I Already Have a Supplier''?",
        "questionHi": "'आपत्ति: 'मेरे पास पहले से एक सप्लायर है'' का पहला मुख्य बिंदु क्या है?",
        "options": {
          "en": [
            "Acknowledge their current supplier positively",
            "Get curious about what they currently use",
            "Focus on product features first",
            "Never follow up"
          ],
          "hi": [
            "Acknowledge their current supplier positively",
            "Get curious about what they currently use",
            "पहले प्रोडक्ट फीचर पर ध्यान दें",
            "कभी फॉलो-अप न करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "The first key point: Acknowledge their current supplier positively",
        "explanationHi": "पहला मुख्य बिंदु: Acknowledge their current supplier positively"
      },
      {
        "questionEn": "In the medicine pouch sales script for this topic, what makes the approach effective?",
        "questionHi": "इस टॉपिक की मेडिसिन पाउच सेल्स स्क्रिप्ट में क्या दृष्टिकोण को प्रभावी बनाता है?",
        "options": {
          "en": [
            "Starting with price information",
            "Connecting to the chemist's specific business reality and needs",
            "Listing all product specifications",
            "Using technical terms"
          ],
          "hi": [
            "कीमत की जानकारी से शुरू करना",
            "केमिस्ट की विशिष्ट व्यावसायिक वास्तविकता और ज़रूरतों से जोड़ना",
            "सभी प्रोडक्ट स्पेसिफिकेशन सूचीबद्ध करना",
            "तकनीकी शब्दों का उपयोग करना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Effective scripts connect product benefits to the customer's specific reality and needs.",
        "explanationHi": "प्रभावी स्क्रिप्ट उत्पाद के लाभों को ग्राहक की विशिष्ट वास्तविकता से जोड़ती है।"
      },
      {
        "questionEn": "The most important takeaway from 'Objection: 'I Already Have a Supplier'' is:",
        "questionHi": "'आपत्ति: 'मेरे पास पहले से एक सप्लायर है'' से सबसे महत्वपूर्ण सीख है:",
        "options": {
          "en": [
            "Plain bags = packaging; branded = advertising",
            "Always offer a discount when using this technique",
            "Avoid this approach with difficult customers",
            "Only use this with large orders"
          ],
          "hi": [
            "Plain bags = packaging; branded = advertising",
            "इस तकनीक का उपयोग करते समय हमेशा डिस्काउंट दें",
            "कठिन ग्राहकों के साथ इस दृष्टिकोण से बचें",
            "केवल बड़े ऑर्डर के साथ इसका उपयोग करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key takeaway: Plain bags = packaging; branded = advertising",
        "explanationHi": "मुख्य सीख: Plain bags = packaging; branded = advertising"
      }
    ]
  },
  {
    "orderIndex": 12,
    "groupNumber": 3,
    "titleEn": "Objection: 'MOQ is Too High — I Can't Use 5000'",
    "titleHi": "आपत्ति: 'MOQ बहुत ज़्यादा है — मैं 5000 इस्तेमाल नहीं कर सकता'",
    "sourceBook": "Sell or Be Sold by Grant Cardone",
    "difficulty": "BEGINNER",
    "estimatedMins": 10,
    "contentEn": "The MOQ objection (5000 pieces minimum) is the most specific objection in medicine pouch sales and requires a specific, logical response.\n\nFirst, understand their math:\nA store serving 50 patients/day dispenses medicines to roughly 30-40 of them (not all need bags). That's ~35 pouches/day × 30 working days = ~1050 pouches/month. At that rate, 5000 pouches = 4-5 months supply.\n\nThe 5 Responses to MOQ Objection:\n\n1. The Math Response:\n'Sir, let's calculate. If you serve 50 patients a day and 30 get medicines — that's 30 pouches a day, 900 a month. 5000 pouches = just over 5 months. That's one reorder in 5 months — not a big commitment.'\n\n2. The Non-Perishable Argument:\n'Unlike medicines, packaging doesn't expire. 5000 pouches stored in one corner of your store — they last as long as you need them. No wastage risk.'\n\n3. The Per-Unit Cost Argument:\n'At 5000 pieces, the per-pouch rate is lowest. If we did 2000 pieces, the rate per piece goes up significantly — you'd pay more for less.'\n\n4. The Sharing Option:\n'Some stores in the same building or same market share an order — each takes 2500 pieces with their respective designs. We can accommodate that.'\n\n5. The Investment Reframe:\n'5000 pouches is a one-time investment in your pharmacy's brand. Compare that to what you'd spend on a newspaper ad that runs for one day.'",
    "contentHi": "MOQ आपत्ति (न्यूनतम 5000 पीस) के लिए 5 प्रतिक्रियाएं:\n\n1. गणित प्रतिक्रिया: 30 पाउच/दिन × 30 दिन = 900/महीना → 5000 = 5.5 महीने\n2. नॉन-पेरिशेबल तर्क: पैकेजिंग expire नहीं होती\n3. प्रति-यूनिट लागत तर्क: 5000 पीस पर सबसे कम दर\n4. शेयरिंग विकल्प: एक ही बाज़ार में दुकानें ऑर्डर शेयर करें\n5. निवेश रीफ्रेम: एक अखबार विज्ञापन से तुलना करें",
    "scriptEn": "Chemist: 'I can't take 5000 — that's too many. I won't use them.'\n\nYou: 'I understand the concern. Let me show you the math, sir. How many patients roughly come to your store on a weekday?'\n\nChemist: 'About 60-70.'\n\nYou: 'And of those, how many actually buy medicines that need a pouch? Let's say half — 30. That's 30 pouches a day. 30 working days a month — that's 900 pouches a month. 5000 pouches is just over 5 months of supply. And since these don't expire, you're not taking any risk. You're just buying 5 months ahead. Does that change the picture?'",
    "scriptHi": "केमिस्ट: 'मैं 5000 नहीं ले सकता — यह बहुत ज़्यादा है।'\n\nआप: 'मैं चिंता समझता हूँ। सर, मुझे गणित दिखाने दीजिए। सप्ताह के दिन आपकी दुकान में लगभग कितने मरीज़ आते हैं?'\n\nकेमिस्ट: 'लगभग 60-70।'\n\nआप: 'और उनमें से कितने वास्तव में दवाइयाँ खरीदते हैं जिन्हें पाउच चाहिए? मान लीजिए आधे — 30। यह 30 पाउच/दिन है। 30 कार्यदिवस × 900/महीना = 5000 पाउच 5 महीने से अधिक का सप्लाई। और ये expire नहीं होते।'",
    "keyPoints": [
      "Use math to show 5000 = 4-5 months supply",
      "Pouches don't expire — no wastage risk",
      "Higher quantity = lower per-piece rate",
      "Stores can share orders with nearby pharmacies",
      "Compare to cost of one newspaper ad"
    ],
    "questions": [
      {
        "questionEn": "What is the core concept of 'Objection: 'MOQ is Too High — I Can't Use 5000''?",
        "questionHi": "'आपत्ति: 'MOQ बहुत ज़्यादा है — मैं 5000 इस्तेमाल नहीं कर सकता'' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "It's about product features only",
            "It's about applying Objection: 'MOQ is Too High to build trust and close sales",
            "It's about giving discounts",
            "It's about calling more people"
          ],
          "hi": [
            "यह केवल प्रोडक्ट फीचर के बारे में है",
            "यह भरोसा बनाने और सेल बंद करने के लिए आपत्ति: 'MOQ बहुत ज़्यादा है लागू करने के बारे में है",
            "यह डिस्काउंट देने के बारे में है",
            "यह अधिक लोगों को कॉल करने के बारे में है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This topic is fundamentally about applying the principle to solve a real selling challenge.",
        "explanationHi": "यह टॉपिक मूल रूप से एक वास्तविक बिक्री चुनौती को हल करने के लिए सिद्धांत लागू करने के बारे में है।"
      },
      {
        "questionEn": "In medicine pouch sales, when should you use the 'Objection: 'MOQ is Too High' technique?",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: 'MOQ बहुत ज़्यादा है' तकनीक का उपयोग कब करना चाहिए?",
        "options": {
          "en": [
            "Only at the beginning of the call",
            "Only when the customer objects",
            "Throughout the call when relevant, especially when facing resistance",
            "Only when closing"
          ],
          "hi": [
            "केवल कॉल की शुरुआत में",
            "केवल जब ग्राहक आपत्ति करे",
            "प्रतिरोध का सामना करते समय विशेष रूप से, जब प्रासंगिक हो",
            "केवल बंद करते समय"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Sales techniques are most powerful when applied contextually throughout the call.",
        "explanationHi": "सेल्स तकनीकें तब सबसे शक्तिशाली होती हैं जब पूरी कॉल में संदर्भानुसार लागू की जाती हैं।"
      },
      {
        "questionEn": "What is the first key point of 'Objection: 'MOQ is Too High — I Can't Use 5000''?",
        "questionHi": "'आपत्ति: 'MOQ बहुत ज़्यादा है — मैं 5000 इस्तेमाल नहीं कर सकता'' का पहला मुख्य बिंदु क्या है?",
        "options": {
          "en": [
            "Use math to show 5000 = 4-5 months supply",
            "Pouches don't expire — no wastage risk",
            "Focus on product features first",
            "Never follow up"
          ],
          "hi": [
            "Use math to show 5000 = 4-5 months supply",
            "Pouches don't expire — no wastage risk",
            "पहले प्रोडक्ट फीचर पर ध्यान दें",
            "कभी फॉलो-अप न करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "The first key point: Use math to show 5000 = 4-5 months supply",
        "explanationHi": "पहला मुख्य बिंदु: Use math to show 5000 = 4-5 months supply"
      },
      {
        "questionEn": "In the medicine pouch sales script for this topic, what makes the approach effective?",
        "questionHi": "इस टॉपिक की मेडिसिन पाउच सेल्स स्क्रिप्ट में क्या दृष्टिकोण को प्रभावी बनाता है?",
        "options": {
          "en": [
            "Starting with price information",
            "Connecting to the chemist's specific business reality and needs",
            "Listing all product specifications",
            "Using technical terms"
          ],
          "hi": [
            "कीमत की जानकारी से शुरू करना",
            "केमिस्ट की विशिष्ट व्यावसायिक वास्तविकता और ज़रूरतों से जोड़ना",
            "सभी प्रोडक्ट स्पेसिफिकेशन सूचीबद्ध करना",
            "तकनीकी शब्दों का उपयोग करना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Effective scripts connect product benefits to the customer's specific reality and needs.",
        "explanationHi": "प्रभावी स्क्रिप्ट उत्पाद के लाभों को ग्राहक की विशिष्ट वास्तविकता से जोड़ती है।"
      },
      {
        "questionEn": "The most important takeaway from 'Objection: 'MOQ is Too High — I Can't Use 5000'' is:",
        "questionHi": "'आपत्ति: 'MOQ बहुत ज़्यादा है — मैं 5000 इस्तेमाल नहीं कर सकता'' से सबसे महत्वपूर्ण सीख है:",
        "options": {
          "en": [
            "Compare to cost of one newspaper ad",
            "Always offer a discount when using this technique",
            "Avoid this approach with difficult customers",
            "Only use this with large orders"
          ],
          "hi": [
            "Compare to cost of one newspaper ad",
            "इस तकनीक का उपयोग करते समय हमेशा डिस्काउंट दें",
            "कठिन ग्राहकों के साथ इस दृष्टिकोण से बचें",
            "केवल बड़े ऑर्डर के साथ इसका उपयोग करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key takeaway: Compare to cost of one newspaper ad",
        "explanationHi": "मुख्य सीख: Compare to cost of one newspaper ad"
      }
    ]
  },
  {
    "orderIndex": 13,
    "groupNumber": 3,
    "titleEn": "Objection: 'Your Price is Higher Than Market'",
    "titleHi": "आपत्ति: 'आपकी कीमत बाज़ार से ज़्यादा है'",
    "sourceBook": "Never Split the Difference by Chris Voss",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 11,
    "contentEn": "When a chemist says your price is higher than the market, they are making a comparison. Your job is to ensure they're comparing apples to apples — not apples to oranges.\n\nStep 1: Welcome the comparison\n'That's a fair point, sir — and I'd want you to compare. The question is: compare what exactly?'\n\nStep 2: Expose the false comparison\nMost local market pouches are:\n- 40-50 GSM paper (vs our 70 GSM)\n- Single color printing (vs our multicolor)\n- No pharmacy branding (vs your pharmacy name, logo, number)\n- No GST invoice (vs our proper documentation)\n- Inconsistent print quality\n\n'When you say market rate — is that for a plain, unbranded, single-color 40 GSM bag? Because yes, that's cheaper. But that's a different product.'\n\nStep 3: The value-per-unit breakdown\n'Our pouch costs ₹X per piece. A plain bag is ₹Y. The difference is ₹Z per pouch. For that ₹Z extra, you get:\n- Your pharmacy name reaching a patient's home\n- Multicolor, professional look\n- 70 GSM — won't tear\n- GST invoice\n- Brand recall every time they take medicine'\n\nStep 4: The ROI question\n'If this pouch brings 2 extra patients to call you per month instead of going to a competitor — at ₹500 average bill — that's ₹1000 extra revenue per month. The ₹Z extra you're spending per pouch pays back in the first week. Fair math?'\n\nPrice objections are always value gaps. Fill the gap with specific value comparison.",
    "contentHi": "जब केमिस्ट कहता है आपकी कीमत ज़्यादा है:\n\nचरण 1: तुलना का स्वागत करें\nचरण 2: झूठी तुलना उजागर करें\n- 40-50 GSM बनाम हमारे 70 GSM\n- सिंगल कलर बनाम मल्टीकलर\n- कोई ब्रांडिंग नहीं बनाम आपका नाम\nचरण 3: प्रति-यूनिट मूल्य विभाजन\nचरण 4: ROI सवाल\n\n'2 अतिरिक्त मरीज़/महीना × ₹500 = ₹1000 अतिरिक्त राजस्व'",
    "scriptEn": "Chemist: 'Your price is ₹3 per pouch. Market mein ₹1 mein milte hain.'\n\nYou: 'Sir, that ₹1 pouch — what does it look like? Plain, no printing, right? Maybe 40 GSM?'\n\nChemist: 'Yes, plain.'\n\nYou: 'So you're comparing a plain carry bag to a branded, multicolor, 70 GSM pouch with your pharmacy name, logo, and phone number on it. That's like comparing a plain white box to a gift-wrapped box with a ribbon — same function, completely different effect on the person receiving it.\n\nLet me ask you — if a patient opens your branded pouch at home and reads your number — and next time they need medicine they call you instead of going somewhere else — how much is that call worth to you?'",
    "scriptHi": "केमिस्ट: 'आपकी कीमत ₹3 प्रति पाउच है। मार्केट में ₹1 में मिलते हैं।'\n\nआप: 'सर, वो ₹1 का पाउच — कैसा दिखता है? सादा, कोई प्रिंटिंग नहीं, है ना? शायद 40 GSM?'\n\nकेमिस्ट: 'हाँ, सादा।'\n\nआप: 'तो आप एक सादे कैरी बैग की तुलना एक ब्रांडेड, मल्टीकलर, 70 GSM पाउच से कर रहे हैं जिस पर आपकी फार्मेसी का नाम, लोगो और फोन नंबर है। यह एक सादे सफेद बॉक्स की तुलना रिबन वाले गिफ्ट-रैप्ड बॉक्स से करने जैसा है।'",
    "keyPoints": [
      "Welcome price comparison — don't avoid it",
      "Expose the false comparison: 40 GSM vs 70 GSM",
      "Plain bag vs branded pouch are different products",
      "Use ROI math: 2 patients/month = ₹1000 revenue",
      "Fill value gaps, don't drop price"
    ],
    "questions": [
      {
        "questionEn": "What is the core concept of 'Objection: 'Your Price is Higher Than Market''?",
        "questionHi": "'आपत्ति: 'आपकी कीमत बाज़ार से ज़्यादा है'' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "It's about product features only",
            "It's about applying Objection: 'Your Price is Higher Than Market' to build trust and close sales",
            "It's about giving discounts",
            "It's about calling more people"
          ],
          "hi": [
            "यह केवल प्रोडक्ट फीचर के बारे में है",
            "यह भरोसा बनाने और सेल बंद करने के लिए आपत्ति: 'आपकी कीमत बाज़ार से ज़्यादा है' लागू करने के बारे में है",
            "यह डिस्काउंट देने के बारे में है",
            "यह अधिक लोगों को कॉल करने के बारे में है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This topic is fundamentally about applying the principle to solve a real selling challenge.",
        "explanationHi": "यह टॉपिक मूल रूप से एक वास्तविक बिक्री चुनौती को हल करने के लिए सिद्धांत लागू करने के बारे में है।"
      },
      {
        "questionEn": "In medicine pouch sales, when should you use the 'Objection: 'Your Price is Higher Than Market'' technique?",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: 'आपकी कीमत बाज़ार से ज़्यादा है'' तकनीक का उपयोग कब करना चाहिए?",
        "options": {
          "en": [
            "Only at the beginning of the call",
            "Only when the customer objects",
            "Throughout the call when relevant, especially when facing resistance",
            "Only when closing"
          ],
          "hi": [
            "केवल कॉल की शुरुआत में",
            "केवल जब ग्राहक आपत्ति करे",
            "प्रतिरोध का सामना करते समय विशेष रूप से, जब प्रासंगिक हो",
            "केवल बंद करते समय"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Sales techniques are most powerful when applied contextually throughout the call.",
        "explanationHi": "सेल्स तकनीकें तब सबसे शक्तिशाली होती हैं जब पूरी कॉल में संदर्भानुसार लागू की जाती हैं।"
      },
      {
        "questionEn": "What is the first key point of 'Objection: 'Your Price is Higher Than Market''?",
        "questionHi": "'आपत्ति: 'आपकी कीमत बाज़ार से ज़्यादा है'' का पहला मुख्य बिंदु क्या है?",
        "options": {
          "en": [
            "Welcome price comparison — don't avoid it",
            "Expose the false comparison: 40 GSM vs 70 GSM",
            "Focus on product features first",
            "Never follow up"
          ],
          "hi": [
            "Welcome price comparison — don't avoid it",
            "Expose the false comparison: 40 GSM vs 70 GSM",
            "पहले प्रोडक्ट फीचर पर ध्यान दें",
            "कभी फॉलो-अप न करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "The first key point: Welcome price comparison — don't avoid it",
        "explanationHi": "पहला मुख्य बिंदु: Welcome price comparison — don't avoid it"
      },
      {
        "questionEn": "In the medicine pouch sales script for this topic, what makes the approach effective?",
        "questionHi": "इस टॉपिक की मेडिसिन पाउच सेल्स स्क्रिप्ट में क्या दृष्टिकोण को प्रभावी बनाता है?",
        "options": {
          "en": [
            "Starting with price information",
            "Connecting to the chemist's specific business reality and needs",
            "Listing all product specifications",
            "Using technical terms"
          ],
          "hi": [
            "कीमत की जानकारी से शुरू करना",
            "केमिस्ट की विशिष्ट व्यावसायिक वास्तविकता और ज़रूरतों से जोड़ना",
            "सभी प्रोडक्ट स्पेसिफिकेशन सूचीबद्ध करना",
            "तकनीकी शब्दों का उपयोग करना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Effective scripts connect product benefits to the customer's specific reality and needs.",
        "explanationHi": "प्रभावी स्क्रिप्ट उत्पाद के लाभों को ग्राहक की विशिष्ट वास्तविकता से जोड़ती है।"
      },
      {
        "questionEn": "The most important takeaway from 'Objection: 'Your Price is Higher Than Market'' is:",
        "questionHi": "'आपत्ति: 'आपकी कीमत बाज़ार से ज़्यादा है'' से सबसे महत्वपूर्ण सीख है:",
        "options": {
          "en": [
            "Fill value gaps, don't drop price",
            "Always offer a discount when using this technique",
            "Avoid this approach with difficult customers",
            "Only use this with large orders"
          ],
          "hi": [
            "Fill value gaps, don't drop price",
            "इस तकनीक का उपयोग करते समय हमेशा डिस्काउंट दें",
            "कठिन ग्राहकों के साथ इस दृष्टिकोण से बचें",
            "केवल बड़े ऑर्डर के साथ इसका उपयोग करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key takeaway: Fill value gaps, don't drop price",
        "explanationHi": "मुख्य सीख: Fill value gaps, don't drop price"
      }
    ]
  },
  {
    "orderIndex": 14,
    "groupNumber": 3,
    "titleEn": "Objection: 'I'll Think About It'",
    "titleHi": "आपत्ति: 'मैं सोचूँगा'",
    "sourceBook": "SPIN Selling by Neil Rackham",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "'I'll think about it' is the most dangerous objection — it feels polite but it's actually a slow death. Most 'I'll think about it' situations never convert because no new information enters the conversation.\n\nWhy it happens:\n- They're not convinced enough to say yes\n- They're too polite to say no\n- They have an unspoken concern they haven't voiced\n- They genuinely need time (rare)\n\nThe Right Response Framework:\n\nStep 1: Normalize it\n'Of course, sir — that's completely fair. A purchase decision should feel right.'\n\nStep 2: Ask the real question\n'Can I ask — what specifically would help you think it through? Is it the quantity, the price, or something about the design?' You must find the REAL objection hiding behind 'I'll think about it.'\n\nStep 3: Remove the thinking work\n'What if I did this — I send you a sample design of your pharmacy name by tonight. You look at it. If it speaks to you, we talk. If not, no pressure at all. Would that help make the decision easier?'\n\nStep 4: Set a specific follow-up\n'I'll check in on Thursday — is that okay?' Never 'I'll call you sometime.' A specific time creates a micro-commitment.\n\nThe hidden objection finder:\nAfter 'I'll think about it,' try: 'Honestly sir — on a scale of 1 to 10, how likely are you to go ahead?' If they say 6 or below — ask 'What would make it a 9?' Now you have the real objection. If they say 8+ — they're close. The sample and a follow-up call will close it.",
    "contentHi": "'मैं सोचूँगा' सबसे खतरनाक आपत्ति है — यह विनम्र लगती है लेकिन असल में यह धीमी मौत है।\n\nसही प्रतिक्रिया फ्रेमवर्क:\nचरण 1: इसे सामान्य बनाएं\nचरण 2: असली सवाल पूछें\nचरण 3: सोचने का काम हटाएं\nचरण 4: विशिष्ट फॉलो-अप सेट करें\n\nछिपी आपत्ति खोजक:\n'ईमानदारी से सर — 1 से 10 के पैमाने पर, आप कितना आगे जाने की संभावना है?' 6 या उससे कम = असली आपत्ति खोजें।",
    "scriptEn": "Chemist: 'Let me think about it and I'll get back to you.'\n\nYou: 'Of course — absolutely. Can I ask just one thing? When you say think about it — is it the quantity that feels like a stretch, or the price, or something about whether this will actually work for your store?'\n\nChemist: 'Honestly, I'm not sure my customers will even notice.'\n\nYou: 'Ah — that's a fair concern. Let me tell you what we see: In the first month after a store switches to branded pouches, patients start asking 'Is this new?' — and it opens a conversation. But rather than take my word for it, what if I send you a sample design tonight? You look at it — maybe even show it to a customer. See their reaction. Then decide. That's more data than thinking alone gives you.'",
    "scriptHi": "केमिस्ट: 'मैं इसके बारे में सोचता हूँ और वापस आऊँगा।'\n\nआप: 'बिल्कुल। क्या मैं सिर्फ एक बात पूछ सकता हूँ? जब आप कहते हैं कि सोचेंगे — क्या यह मात्रा है जो थोड़ी ज़्यादा लगती है, या कीमत, या कुछ इस बारे में कि यह आपकी दुकान के लिए काम करेगा?'\n\nकेमिस्ट: 'ईमानदारी से, मुझे यकीन नहीं है कि मेरे ग्राहक नोटिस भी करेंगे।'\n\nआप: 'यह एक उचित चिंता है। हम जो देखते हैं: पहले महीने में मरीज़ पूछने लगते हैं कि क्या यह नया है। लेकिन मेरी बात मानने की बजाय, आज रात एक सैम्पल डिज़ाइन भेजूँ? देखें, शायद किसी ग्राहक को दिखाएं। उनकी प्रतिक्रिया देखें।'",
    "keyPoints": [
      "'I'll think about it' hides an unspoken objection",
      "Ask: quantity, price, or confidence issue?",
      "1-10 scale reveals the real objection",
      "Send sample to replace 'thinking' with seeing",
      "Always set a specific follow-up time, not 'sometime'"
    ],
    "questions": [
      {
        "questionEn": "What is the core concept of 'Objection: 'I'll Think About It''?",
        "questionHi": "'आपत्ति: 'मैं सोचूँगा'' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "It's about product features only",
            "It's about applying Objection: 'I'll Think About It' to build trust and close sales",
            "It's about giving discounts",
            "It's about calling more people"
          ],
          "hi": [
            "यह केवल प्रोडक्ट फीचर के बारे में है",
            "यह भरोसा बनाने और सेल बंद करने के लिए आपत्ति: 'मैं सोचूँगा' लागू करने के बारे में है",
            "यह डिस्काउंट देने के बारे में है",
            "यह अधिक लोगों को कॉल करने के बारे में है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This topic is fundamentally about applying the principle to solve a real selling challenge.",
        "explanationHi": "यह टॉपिक मूल रूप से एक वास्तविक बिक्री चुनौती को हल करने के लिए सिद्धांत लागू करने के बारे में है।"
      },
      {
        "questionEn": "In medicine pouch sales, when should you use the 'Objection: 'I'll Think About It'' technique?",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: 'मैं सोचूँगा'' तकनीक का उपयोग कब करना चाहिए?",
        "options": {
          "en": [
            "Only at the beginning of the call",
            "Only when the customer objects",
            "Throughout the call when relevant, especially when facing resistance",
            "Only when closing"
          ],
          "hi": [
            "केवल कॉल की शुरुआत में",
            "केवल जब ग्राहक आपत्ति करे",
            "प्रतिरोध का सामना करते समय विशेष रूप से, जब प्रासंगिक हो",
            "केवल बंद करते समय"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Sales techniques are most powerful when applied contextually throughout the call.",
        "explanationHi": "सेल्स तकनीकें तब सबसे शक्तिशाली होती हैं जब पूरी कॉल में संदर्भानुसार लागू की जाती हैं।"
      },
      {
        "questionEn": "What is the first key point of 'Objection: 'I'll Think About It''?",
        "questionHi": "'आपत्ति: 'मैं सोचूँगा'' का पहला मुख्य बिंदु क्या है?",
        "options": {
          "en": [
            "'I'll think about it' hides an unspoken objection",
            "Ask: quantity, price, or confidence issue?",
            "Focus on product features first",
            "Never follow up"
          ],
          "hi": [
            "'I'll think about it' hides an unspoken objection",
            "Ask: quantity, price, or confidence issue?",
            "पहले प्रोडक्ट फीचर पर ध्यान दें",
            "कभी फॉलो-अप न करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "The first key point: 'I'll think about it' hides an unspoken objection",
        "explanationHi": "पहला मुख्य बिंदु: 'I'll think about it' hides an unspoken objection"
      },
      {
        "questionEn": "In the medicine pouch sales script for this topic, what makes the approach effective?",
        "questionHi": "इस टॉपिक की मेडिसिन पाउच सेल्स स्क्रिप्ट में क्या दृष्टिकोण को प्रभावी बनाता है?",
        "options": {
          "en": [
            "Starting with price information",
            "Connecting to the chemist's specific business reality and needs",
            "Listing all product specifications",
            "Using technical terms"
          ],
          "hi": [
            "कीमत की जानकारी से शुरू करना",
            "केमिस्ट की विशिष्ट व्यावसायिक वास्तविकता और ज़रूरतों से जोड़ना",
            "सभी प्रोडक्ट स्पेसिफिकेशन सूचीबद्ध करना",
            "तकनीकी शब्दों का उपयोग करना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Effective scripts connect product benefits to the customer's specific reality and needs.",
        "explanationHi": "प्रभावी स्क्रिप्ट उत्पाद के लाभों को ग्राहक की विशिष्ट वास्तविकता से जोड़ती है।"
      },
      {
        "questionEn": "The most important takeaway from 'Objection: 'I'll Think About It'' is:",
        "questionHi": "'आपत्ति: 'मैं सोचूँगा'' से सबसे महत्वपूर्ण सीख है:",
        "options": {
          "en": [
            "Always set a specific follow-up time, not 'sometime'",
            "Always offer a discount when using this technique",
            "Avoid this approach with difficult customers",
            "Only use this with large orders"
          ],
          "hi": [
            "Always set a specific follow-up time, not 'sometime'",
            "इस तकनीक का उपयोग करते समय हमेशा डिस्काउंट दें",
            "कठिन ग्राहकों के साथ इस दृष्टिकोण से बचें",
            "केवल बड़े ऑर्डर के साथ इसका उपयोग करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key takeaway: Always set a specific follow-up time, not 'sometime'",
        "explanationHi": "मुख्य सीख: Always set a specific follow-up time, not 'sometime'"
      }
    ]
  },
  {
    "orderIndex": 15,
    "groupNumber": 3,
    "titleEn": "Objection: 'Send Me Your Catalogue/Brochure'",
    "titleHi": "आपत्ति: 'मुझे अपना कैटलॉग/ब्रोशर भेजें'",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 8,
    "contentEn": "'Send me your catalogue' is often a polite brush-off. But it can also be genuine interest. Your job is to distinguish between the two — and in either case, not lose the momentum.\n\nThe Wrong Response:\nSend a 10-page PDF immediately with no follow-up plan. This is 'hope selling' — you hope they read it, hope they like it, hope they call you back. They won't.\n\nThe Right Response Framework:\n\nStep 1: Send LESS, not more\nDon't send a catalogue. Send 3 things only:\n1. Sample pouch design with their pharmacy name (customized)\n2. Price range for their size (not full rate card)\n3. A WhatsApp voice note: 'Bhai, sent you a sample — this is exactly what your pharmacy name would look like on our pouch. One question when you look at it: does the design feel right?'\n\nStep 2: Set the follow-up time in the call\n'I'll send it in the next 10 minutes. Would Thursday morning be a good time to call and hear your thoughts?'\n\nNever send and hope. Always send and schedule.\n\nStep 3: The personalization hook\nA generic catalogue = zero emotional response. A customized image with THEIR pharmacy name = immediate personal connection. They see themselves in the product before they've bought it.\n\nStep 4: The catalogue as a conversation opener\n'Sir, I'm going to send you something in a minute — but I want to make sure I send the right size. What's your main dispensing need — small pouches for tablets, or larger for syrups and combination packs?' Now you're having a consultative conversation, not just fulfilling a brush-off request.",
    "contentHi": "'कैटलॉग भेजें' अक्सर एक विनम्र ब्रश-ऑफ है।\n\nगलत प्रतिक्रिया: तुरंत 10-पेज PDF भेजें — यह 'होप सेलिंग' है।\n\nसही प्रतिक्रिया:\nचरण 1: कम भेजें, ज़्यादा नहीं — 3 चीज़ें:\n1. उनके फार्मेसी नाम के साथ कस्टमाइज़ड सैम्पल\n2. उनके साइज़ की कीमत सीमा\n3. WhatsApp वॉयस नोट\n\nचरण 2: कॉल में ही फॉलो-अप समय सेट करें\nचरण 3: व्यक्तिगतकरण हुक\nचरण 4: कैटलॉग को बातचीत शुरुआत के रूप में उपयोग करें",
    "scriptEn": "Chemist: 'Just send me your catalogue and I'll have a look.'\n\nYou: 'Absolutely — and I want to make sure I send you the most relevant thing. Two quick questions before I send: What size of pouch do you mainly need — smaller ones for tablets or bigger ones for bottles and combinations? And is your pharmacy name in English, Hindi, or both?'\n\nChemist: 'Mainly small ones, English name.'\n\nYou: 'Perfect. I'm going to send you something specific — not a general catalogue but a mock design of your pharmacy name on our 4x5 pouch, exactly how it would look. You'll be able to tell in 5 seconds if you like it. I'll send in the next 10 minutes. And I'll follow up Thursday morning — does 11am work for you?'",
    "scriptHi": "केमिस्ट: 'बस अपना कैटलॉग भेज दें और मैं देख लूँगा।'\n\nआप: 'बिल्कुल — और मैं यह सुनिश्चित करना चाहता हूँ कि सबसे प्रासंगिक चीज़ भेजूँ। भेजने से पहले दो त्वरित सवाल: आपको मुख्य रूप से किस साइज़ का पाउच चाहिए? और आपकी फार्मेसी का नाम अंग्रेज़ी में है, हिंदी में, या दोनों?'\n\nकेमिस्ट: 'मुख्य रूप से छोटे, अंग्रेज़ी नाम।'\n\nआप: 'परफेक्ट। मैं आपको कुछ विशिष्ट भेजने जा रहा हूँ — आपकी फार्मेसी के नाम का एक मॉक डिज़ाइन। गुरुवार सुबह 11 बजे फॉलो-अप करूँगा — ठीक है?'",
    "keyPoints": [
      "'Send catalogue' is often a brush-off — don't just send",
      "Ask size and name questions before sending",
      "Send 3 things only: design mockup, price range, voice note",
      "Never send and hope — always send and schedule",
      "Personalized mockup beats generic catalogue every time"
    ],
    "questions": [
      {
        "questionEn": "What is the core concept of 'Objection: 'Send Me Your Catalogue/Brochure''?",
        "questionHi": "'आपत्ति: 'मुझे अपना कैटलॉग/ब्रोशर भेजें'' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "It's about product features only",
            "It's about applying Objection: 'Send Me Your Catalogue/Brochure' to build trust and close sales",
            "It's about giving discounts",
            "It's about calling more people"
          ],
          "hi": [
            "यह केवल प्रोडक्ट फीचर के बारे में है",
            "यह भरोसा बनाने और सेल बंद करने के लिए आपत्ति: 'मुझे अपना कैटलॉग/ब्रोशर भेजें' लागू करने के बारे में है",
            "यह डिस्काउंट देने के बारे में है",
            "यह अधिक लोगों को कॉल करने के बारे में है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This topic is fundamentally about applying the principle to solve a real selling challenge.",
        "explanationHi": "यह टॉपिक मूल रूप से एक वास्तविक बिक्री चुनौती को हल करने के लिए सिद्धांत लागू करने के बारे में है।"
      },
      {
        "questionEn": "In medicine pouch sales, when should you use the 'Objection: 'Send Me Your Catalogue/Brochure'' technique?",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: 'मुझे अपना कैटलॉग/ब्रोशर भेजें'' तकनीक का उपयोग कब करना चाहिए?",
        "options": {
          "en": [
            "Only at the beginning of the call",
            "Only when the customer objects",
            "Throughout the call when relevant, especially when facing resistance",
            "Only when closing"
          ],
          "hi": [
            "केवल कॉल की शुरुआत में",
            "केवल जब ग्राहक आपत्ति करे",
            "प्रतिरोध का सामना करते समय विशेष रूप से, जब प्रासंगिक हो",
            "केवल बंद करते समय"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Sales techniques are most powerful when applied contextually throughout the call.",
        "explanationHi": "सेल्स तकनीकें तब सबसे शक्तिशाली होती हैं जब पूरी कॉल में संदर्भानुसार लागू की जाती हैं।"
      },
      {
        "questionEn": "What is the first key point of 'Objection: 'Send Me Your Catalogue/Brochure''?",
        "questionHi": "'आपत्ति: 'मुझे अपना कैटलॉग/ब्रोशर भेजें'' का पहला मुख्य बिंदु क्या है?",
        "options": {
          "en": [
            "'Send catalogue' is often a brush-off — don't just send",
            "Ask size and name questions before sending",
            "Focus on product features first",
            "Never follow up"
          ],
          "hi": [
            "'Send catalogue' is often a brush-off — don't just send",
            "Ask size and name questions before sending",
            "पहले प्रोडक्ट फीचर पर ध्यान दें",
            "कभी फॉलो-अप न करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "The first key point: 'Send catalogue' is often a brush-off — don't just send",
        "explanationHi": "पहला मुख्य बिंदु: 'Send catalogue' is often a brush-off — don't just send"
      },
      {
        "questionEn": "In the medicine pouch sales script for this topic, what makes the approach effective?",
        "questionHi": "इस टॉपिक की मेडिसिन पाउच सेल्स स्क्रिप्ट में क्या दृष्टिकोण को प्रभावी बनाता है?",
        "options": {
          "en": [
            "Starting with price information",
            "Connecting to the chemist's specific business reality and needs",
            "Listing all product specifications",
            "Using technical terms"
          ],
          "hi": [
            "कीमत की जानकारी से शुरू करना",
            "केमिस्ट की विशिष्ट व्यावसायिक वास्तविकता और ज़रूरतों से जोड़ना",
            "सभी प्रोडक्ट स्पेसिफिकेशन सूचीबद्ध करना",
            "तकनीकी शब्दों का उपयोग करना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Effective scripts connect product benefits to the customer's specific reality and needs.",
        "explanationHi": "प्रभावी स्क्रिप्ट उत्पाद के लाभों को ग्राहक की विशिष्ट वास्तविकता से जोड़ती है।"
      },
      {
        "questionEn": "The most important takeaway from 'Objection: 'Send Me Your Catalogue/Brochure'' is:",
        "questionHi": "'आपत्ति: 'मुझे अपना कैटलॉग/ब्रोशर भेजें'' से सबसे महत्वपूर्ण सीख है:",
        "options": {
          "en": [
            "Personalized mockup beats generic catalogue every time",
            "Always offer a discount when using this technique",
            "Avoid this approach with difficult customers",
            "Only use this with large orders"
          ],
          "hi": [
            "Personalized mockup beats generic catalogue every time",
            "इस तकनीक का उपयोग करते समय हमेशा डिस्काउंट दें",
            "कठिन ग्राहकों के साथ इस दृष्टिकोण से बचें",
            "केवल बड़े ऑर्डर के साथ इसका उपयोग करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key takeaway: Personalized mockup beats generic catalogue every time",
        "explanationHi": "मुख्य सीख: Personalized mockup beats generic catalogue every time"
      }
    ]
  },
  {
    "orderIndex": 16,
    "groupNumber": 4,
    "titleEn": "The Psychology of Yes — Micro-Commitments",
    "titleHi": "हाँ का मनोविज्ञान — माइक्रो-कमिटमेंट",
    "sourceBook": "Influence by Robert Cialdini",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 12,
    "contentEn": "Robert Cialdini's research on commitment and consistency shows that humans are psychologically driven to behave consistently with what they've previously agreed to.\n\nIn sales, this means: every small 'yes' makes the next bigger 'yes' easier.\n\nThe Yes Ladder for Medicine Pouch Sales:\n\nStep 1 (Micro-yes): 'Would you agree that patients today are more aware of hygiene and presentation than they were 10 years ago?' — Almost everyone says yes.\n\nStep 2: 'And you'd agree that how a pharmacy looks and feels affects the trust a patient places in it?' — Yes again.\n\nStep 3: 'So if a branded pouch makes your pharmacy look more professional, would that be a good thing for your business?' — Yes.\n\nStep 4: 'Then the only question is whether our specific pouch is the right fit for you — not whether branded pouches are a good idea, because we've already agreed they are.' — Now the debate is narrowed.\n\nStep 5: 'All I need is 5 minutes to show you the design and get your feedback. That's not a commitment to buy — just to look. Yes?'\n\nThis is the 'yes ladder' — each step builds on the previous agreement. By the time you ask for the order, they've said yes 5-6 times already. Consistency psychology kicks in.\n\nThe Foot-in-the-Door principle:\nSmall request → agreement → larger request works far better than jumping straight to the big ask. 'Can I send you a design?' is a far easier yes than 'Will you place an order for 5000 pieces?'",
    "contentHi": "Cialdini की रिसर्च: इंसान पिछली सहमति के अनुरूप व्यवहार करने के लिए मनोवैज्ञानिक रूप से प्रेरित होते हैं।\n\nमेडिसिन पाउच के लिए Yes Ladder:\n\nचरण 1: 'क्या आप मानते हैं कि आज मरीज़ स्वच्छता के बारे में अधिक जागरूक हैं?'\nचरण 2: 'और क्या आप मानेंगे कि दुकान की छवि भरोसे को प्रभावित करती है?'\nचरण 3: 'तो अगर ब्रांडेड पाउच आपकी दुकान को अधिक पेशेवर बनाता है — यह अच्छा होगा?'\nचरण 4: 'फिर सवाल केवल यह है कि क्या हमारा विशिष्ट पाउच आपके लिए सही है।'\nचरण 5: 'डिज़ाइन देखने में 5 मिनट — खरीदने की प्रतिबद्धता नहीं, बस देखना।'",
    "scriptEn": "You: 'Sir, quick question — would you agree that medical stores have gotten more competitive in the last 5 years?'\nChemist: 'Yes, definitely.'\nYou: 'And that patients today have more options — they can go to the store next door or order online?'\nChemist: 'True.'\nYou: 'So anything that creates loyalty — makes them remember YOUR store specifically — would be valuable?'\nChemist: 'Yes, of course.'\nYou: 'Then we agree that branded packaging that puts your phone number in the patient's home is worth exploring?'\nChemist: 'I suppose...'\nYou: 'Great. Then let me send you a 30-second look at what your pharmacy name looks like on our pouch. Just 30 seconds of your time. Yes?'",
    "scriptHi": "आप: 'सर, एक त्वरित सवाल — क्या आप मानते हैं कि पिछले 5 साल में मेडिकल स्टोर अधिक प्रतिस्पर्धी हो गए हैं?'\nकेमिस्ट: 'हाँ, निश्चित रूप से।'\nआप: 'और कि आज मरीज़ों के पास अधिक विकल्प हैं?'\nकेमिस्ट: 'सच है।'\nआप: 'तो कोई भी चीज़ जो वफादारी बनाती है — उन्हें आपकी दुकान याद दिलाती है — मूल्यवान होगी?'\nकेमिस्ट: 'हाँ, बिल्कुल।'\nआप: 'तो हम इस बात पर सहमत हैं कि ब्रांडेड पैकेजिंग तलाशने लायक है?'",
    "keyPoints": [
      "Each small yes makes the next yes easier",
      "Build the yes ladder before asking for order",
      "Foot-in-door: small request first",
      "By the time you ask, they've said yes 5-6 times",
      "'Can I send a design?' is easier than 'Place an order'"
    ],
    "questions": [
      {
        "questionEn": "What is the core concept of 'The Psychology of Yes — Micro-Commitments'?",
        "questionHi": "'हाँ का मनोविज्ञान — माइक्रो-कमिटमेंट' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "It's about product features only",
            "It's about applying The Psychology of Yes to build trust and close sales",
            "It's about giving discounts",
            "It's about calling more people"
          ],
          "hi": [
            "यह केवल प्रोडक्ट फीचर के बारे में है",
            "यह भरोसा बनाने और सेल बंद करने के लिए हाँ का मनोविज्ञान लागू करने के बारे में है",
            "यह डिस्काउंट देने के बारे में है",
            "यह अधिक लोगों को कॉल करने के बारे में है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This topic is fundamentally about applying the principle to solve a real selling challenge.",
        "explanationHi": "यह टॉपिक मूल रूप से एक वास्तविक बिक्री चुनौती को हल करने के लिए सिद्धांत लागू करने के बारे में है।"
      },
      {
        "questionEn": "In medicine pouch sales, when should you use the 'The Psychology of Yes' technique?",
        "questionHi": "मेडिसिन पाउच सेल्स में 'हाँ का मनोविज्ञान' तकनीक का उपयोग कब करना चाहिए?",
        "options": {
          "en": [
            "Only at the beginning of the call",
            "Only when the customer objects",
            "Throughout the call when relevant, especially when facing resistance",
            "Only when closing"
          ],
          "hi": [
            "केवल कॉल की शुरुआत में",
            "केवल जब ग्राहक आपत्ति करे",
            "प्रतिरोध का सामना करते समय विशेष रूप से, जब प्रासंगिक हो",
            "केवल बंद करते समय"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Sales techniques are most powerful when applied contextually throughout the call.",
        "explanationHi": "सेल्स तकनीकें तब सबसे शक्तिशाली होती हैं जब पूरी कॉल में संदर्भानुसार लागू की जाती हैं।"
      },
      {
        "questionEn": "What is the first key point of 'The Psychology of Yes — Micro-Commitments'?",
        "questionHi": "'हाँ का मनोविज्ञान — माइक्रो-कमिटमेंट' का पहला मुख्य बिंदु क्या है?",
        "options": {
          "en": [
            "Each small yes makes the next yes easier",
            "Build the yes ladder before asking for order",
            "Focus on product features first",
            "Never follow up"
          ],
          "hi": [
            "Each small yes makes the next yes easier",
            "Build the yes ladder before asking for order",
            "पहले प्रोडक्ट फीचर पर ध्यान दें",
            "कभी फॉलो-अप न करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "The first key point: Each small yes makes the next yes easier",
        "explanationHi": "पहला मुख्य बिंदु: Each small yes makes the next yes easier"
      },
      {
        "questionEn": "In the medicine pouch sales script for this topic, what makes the approach effective?",
        "questionHi": "इस टॉपिक की मेडिसिन पाउच सेल्स स्क्रिप्ट में क्या दृष्टिकोण को प्रभावी बनाता है?",
        "options": {
          "en": [
            "Starting with price information",
            "Connecting to the chemist's specific business reality and needs",
            "Listing all product specifications",
            "Using technical terms"
          ],
          "hi": [
            "कीमत की जानकारी से शुरू करना",
            "केमिस्ट की विशिष्ट व्यावसायिक वास्तविकता और ज़रूरतों से जोड़ना",
            "सभी प्रोडक्ट स्पेसिफिकेशन सूचीबद्ध करना",
            "तकनीकी शब्दों का उपयोग करना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Effective scripts connect product benefits to the customer's specific reality and needs.",
        "explanationHi": "प्रभावी स्क्रिप्ट उत्पाद के लाभों को ग्राहक की विशिष्ट वास्तविकता से जोड़ती है।"
      },
      {
        "questionEn": "The most important takeaway from 'The Psychology of Yes — Micro-Commitments' is:",
        "questionHi": "'हाँ का मनोविज्ञान — माइक्रो-कमिटमेंट' से सबसे महत्वपूर्ण सीख है:",
        "options": {
          "en": [
            "'Can I send a design?' is easier than 'Place an order'",
            "Always offer a discount when using this technique",
            "Avoid this approach with difficult customers",
            "Only use this with large orders"
          ],
          "hi": [
            "'Can I send a design?' is easier than 'Place an order'",
            "इस तकनीक का उपयोग करते समय हमेशा डिस्काउंट दें",
            "कठिन ग्राहकों के साथ इस दृष्टिकोण से बचें",
            "केवल बड़े ऑर्डर के साथ इसका उपयोग करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key takeaway: 'Can I send a design?' is easier than 'Place an order'",
        "explanationHi": "मुख्य सीख: 'Can I send a design?' is easier than 'Place an order'"
      }
    ]
  },
  {
    "orderIndex": 17,
    "groupNumber": 4,
    "titleEn": "Reading Buying Signals — When to Close",
    "titleHi": "खरीद संकेत पढ़ना — कब बंद करें",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 10,
    "contentEn": "Most salespeople miss the close not because the customer wasn't ready — but because they didn't recognize the buying signal.\n\nBuying signals are words or behaviors that indicate the customer is mentally moving toward a purchase decision.\n\nVerbal Buying Signals in Medicine Pouch Calls:\n1. Questions about specifics: 'What exactly is printed on the front?' 'Can we print in Gujarati also?' — They're mentally designing their pouch.\n2. Quantity questions: 'What if I need 3000 instead of 5000?' — They're planning.\n3. Delivery questions: 'How long does delivery take?' — They're imagining receiving it.\n4. Reference questions: 'Do you have any samples I can see?' — They want confirmation.\n5. Process questions: 'How do I place an order?' — This is practically a yes.\n\nNon-Verbal Buying Signals (on phone):\n- Tone shift from resistant to curious\n- Longer responses to your questions\n- Asking you to repeat information (they're processing)\n- Silence after you present value (they're thinking about it seriously)\n\nThe Golden Rule: When you spot a buying signal — stop selling and start closing.\n\nMost salespeople miss this. They see the signal but keep talking — afraid they'll scare the customer away. Instead of closing, they continue pitching. This breaks the spell.\n\nThe Closing Bridge:\nBuying Signal: 'Can we print our address on it too?'\nWrong response: 'Yes! And we can also do this, and that, and we offer...'\nRight response: 'Yes, absolutely — front side, back side, all the details you want. Shall I put together a design draft with your full details so you can see exactly how it looks?'\n\nYou've turned their question into a design request — which is the first step to an order.",
    "contentHi": "खरीद संकेत वे शब्द या व्यवहार हैं जो संकेत देते हैं कि ग्राहक मानसिक रूप से खरीद निर्णय की ओर बढ़ रहा है।\n\nमौखिक खरीद संकेत:\n1. विशिष्टताओं के बारे में सवाल\n2. मात्रा के सवाल\n3. डिलीवरी के सवाल\n4. संदर्भ के सवाल\n5. प्रक्रिया के सवाल\n\nस्वर्णिम नियम: जब आप खरीद संकेत देखें — बेचना बंद करें और बंद करना शुरू करें।\n\nक्लोज़िंग ब्रिज:\nखरीद संकेत: 'क्या हम उस पर अपना पता भी प्रिंट कर सकते हैं?'\nसही जवाब: 'हाँ, बिल्कुल — क्या मैं आपके पूरे विवरण के साथ एक डिज़ाइन ड्राफ्ट तैयार करूँ?'",
    "scriptEn": "Chemist: 'Can we also print our doctor's name on the pouch?'\n\n(BUYING SIGNAL — they're designing their pouch mentally)\n\nYou: [Stop selling. Start closing.] 'Absolutely — that's actually a great idea. Many pharmacy owners add the consulting doctor's name on one side. It increases patient trust. Shall I put together a design mock with your pharmacy name, doctor's name, and phone number so you can see exactly how it would look? That takes about 24 hours — I'll have it ready by tomorrow morning.'\n\n(You've moved from call to design request = first commitment to the order process.)",
    "scriptHi": "केमिस्ट: 'क्या हम पाउच पर अपने डॉक्टर का नाम भी प्रिंट कर सकते हैं?'\n\n(खरीद संकेत — वे मानसिक रूप से अपना पाउच डिज़ाइन कर रहे हैं)\n\nआप: [बेचना बंद करें। बंद करना शुरू करें।] 'बिल्कुल — यह वास्तव में एक अच्छा विचार है। क्या मैं आपकी फार्मेसी के नाम, डॉक्टर के नाम और फोन नंबर के साथ एक डिज़ाइन मॉक तैयार करूँ? इसमें 24 घंटे लगेंगे — कल सुबह तैयार होगा।'",
    "keyPoints": [
      "5 verbal buying signals to memorize",
      "Tone shift from resistant to curious = buying signal",
      "When you spot a signal — stop selling, start closing",
      "Turn their specific question into a design request",
      "Silence after value = serious consideration"
    ],
    "questions": [
      {
        "questionEn": "What is the core concept of 'Reading Buying Signals — When to Close'?",
        "questionHi": "'खरीद संकेत पढ़ना — कब बंद करें' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "It's about product features only",
            "It's about applying Reading Buying Signals to build trust and close sales",
            "It's about giving discounts",
            "It's about calling more people"
          ],
          "hi": [
            "यह केवल प्रोडक्ट फीचर के बारे में है",
            "यह भरोसा बनाने और सेल बंद करने के लिए खरीद संकेत पढ़ना लागू करने के बारे में है",
            "यह डिस्काउंट देने के बारे में है",
            "यह अधिक लोगों को कॉल करने के बारे में है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This topic is fundamentally about applying the principle to solve a real selling challenge.",
        "explanationHi": "यह टॉपिक मूल रूप से एक वास्तविक बिक्री चुनौती को हल करने के लिए सिद्धांत लागू करने के बारे में है।"
      },
      {
        "questionEn": "In medicine pouch sales, when should you use the 'Reading Buying Signals' technique?",
        "questionHi": "मेडिसिन पाउच सेल्स में 'खरीद संकेत पढ़ना' तकनीक का उपयोग कब करना चाहिए?",
        "options": {
          "en": [
            "Only at the beginning of the call",
            "Only when the customer objects",
            "Throughout the call when relevant, especially when facing resistance",
            "Only when closing"
          ],
          "hi": [
            "केवल कॉल की शुरुआत में",
            "केवल जब ग्राहक आपत्ति करे",
            "प्रतिरोध का सामना करते समय विशेष रूप से, जब प्रासंगिक हो",
            "केवल बंद करते समय"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Sales techniques are most powerful when applied contextually throughout the call.",
        "explanationHi": "सेल्स तकनीकें तब सबसे शक्तिशाली होती हैं जब पूरी कॉल में संदर्भानुसार लागू की जाती हैं।"
      },
      {
        "questionEn": "What is the first key point of 'Reading Buying Signals — When to Close'?",
        "questionHi": "'खरीद संकेत पढ़ना — कब बंद करें' का पहला मुख्य बिंदु क्या है?",
        "options": {
          "en": [
            "5 verbal buying signals to memorize",
            "Tone shift from resistant to curious = buying signal",
            "Focus on product features first",
            "Never follow up"
          ],
          "hi": [
            "5 verbal buying signals to memorize",
            "Tone shift from resistant to curious = buying signal",
            "पहले प्रोडक्ट फीचर पर ध्यान दें",
            "कभी फॉलो-अप न करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "The first key point: 5 verbal buying signals to memorize",
        "explanationHi": "पहला मुख्य बिंदु: 5 verbal buying signals to memorize"
      },
      {
        "questionEn": "In the medicine pouch sales script for this topic, what makes the approach effective?",
        "questionHi": "इस टॉपिक की मेडिसिन पाउच सेल्स स्क्रिप्ट में क्या दृष्टिकोण को प्रभावी बनाता है?",
        "options": {
          "en": [
            "Starting with price information",
            "Connecting to the chemist's specific business reality and needs",
            "Listing all product specifications",
            "Using technical terms"
          ],
          "hi": [
            "कीमत की जानकारी से शुरू करना",
            "केमिस्ट की विशिष्ट व्यावसायिक वास्तविकता और ज़रूरतों से जोड़ना",
            "सभी प्रोडक्ट स्पेसिफिकेशन सूचीबद्ध करना",
            "तकनीकी शब्दों का उपयोग करना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Effective scripts connect product benefits to the customer's specific reality and needs.",
        "explanationHi": "प्रभावी स्क्रिप्ट उत्पाद के लाभों को ग्राहक की विशिष्ट वास्तविकता से जोड़ती है।"
      },
      {
        "questionEn": "The most important takeaway from 'Reading Buying Signals — When to Close' is:",
        "questionHi": "'खरीद संकेत पढ़ना — कब बंद करें' से सबसे महत्वपूर्ण सीख है:",
        "options": {
          "en": [
            "Silence after value = serious consideration",
            "Always offer a discount when using this technique",
            "Avoid this approach with difficult customers",
            "Only use this with large orders"
          ],
          "hi": [
            "Silence after value = serious consideration",
            "इस तकनीक का उपयोग करते समय हमेशा डिस्काउंट दें",
            "कठिन ग्राहकों के साथ इस दृष्टिकोण से बचें",
            "केवल बड़े ऑर्डर के साथ इसका उपयोग करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key takeaway: Silence after value = serious consideration",
        "explanationHi": "मुख्य सीख: Silence after value = serious consideration"
      }
    ]
  },
  {
    "orderIndex": 18,
    "groupNumber": 4,
    "titleEn": "The Assumptive Close — Act Like the Deal is Done",
    "titleHi": "असम्पटिव क्लोज़ — जैसे डील हो चुकी हो",
    "sourceBook": "Sell or Be Sold by Grant Cardone",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "The assumptive close is not a trick — it's a mindset. You genuinely believe the customer will benefit from your product, so you naturally speak as if it's going to happen.\n\nThe psychology: If you speak with confidence and assume the next step, the customer's brain fills in the gap by agreeing. Hesitation from your side creates hesitation in them.\n\nAssuming the Next Step vs. Asking Permission:\nAsking: 'Would you like to go ahead?' — Puts up decision pressure, 50/50 chance of no.\nAssuming: 'So I'll have the design ready by Friday — shall we use your current logo or do you have an updated one?' — You've moved to implementation details. The purchase is assumed.\n\nThe 4 Assumptive Close Techniques for Medicine Pouches:\n\n1. The Logistics Assumption\n'So for the delivery — is your store address the same as what's on your sign board, or a different billing address?' — You're asking about delivery, not whether to buy.\n\n2. The Design Assumption\n'For the pouch — should we put your mobile number or landline on the back side?' — Design discussion assumes order.\n\n3. The Timing Assumption\n'We have slots this week and next — which batch would you prefer, so I can reserve your design slot?' — Scarcity + assumption.\n\n4. The Quantity Assumption\n'Most stores in your area start with 5000 to test and then reorder. Shall I note 5000 for now?' — Social proof + assumption.\n\nImportant: The assumptive close only works when:\n- You've established clear value earlier in the call\n- The customer has shown interest or buying signals\n- You deliver it with calm confidence, not pushiness\n\nIf they correct you ('Wait, I haven't decided yet') — you've just discovered a real objection to address.",
    "contentHi": "असम्पटिव क्लोज़ एक चाल नहीं है — यह एक मानसिकता है।\n\n4 असम्पटिव क्लोज़ तकनीकें:\n\n1. लॉजिस्टिक्स अनुमान: 'डिलीवरी के लिए — क्या आपका स्टोर पता साइनबोर्ड जैसा ही है?'\n2. डिज़ाइन अनुमान: 'पाउच के लिए — पीछे मोबाइल नंबर या लैंडलाइन?'\n3. समय अनुमान: 'इस हफ्ते और अगले हफ्ते स्लॉट हैं — कौन सा बैच पसंद करेंगे?'\n4. मात्रा अनुमान: 'आपके क्षेत्र की ज़्यादातर दुकानें 5000 से शुरू करती हैं। क्या मैं 5000 नोट करूँ?'",
    "scriptEn": "After a good call where the chemist has shown interest:\n\nYou: 'So for the 4x5 size — should we do your pharmacy name in English, Hindi, or both on the front?\n\nChemist: 'English is fine.'\n\nYou: 'And the phone number — mobile or the store's landline?\n\nChemist: 'Mobile.'\n\nYou: 'Perfect. And for delivery — we ship anywhere in India. Your store's GST address, shall I use that for the invoice? Or different?'\n\nChemist: 'GST address is fine.'\n\nYou: 'Noted. I'll have a design proof ready by tomorrow for your approval — once you confirm, we start production. Typically 10-15 working days delivery. Does that work?'\n\n(They've been answering logistics questions — never said yes, but never said no. The order is in motion.)",
    "scriptHi": "एक अच्छी कॉल के बाद जहाँ केमिस्ट ने रुचि दिखाई:\n\nआप: '4x5 साइज़ के लिए — आपकी फार्मेसी का नाम अंग्रेज़ी में, हिंदी में, या दोनों में?\n\nकेमिस्ट: 'अंग्रेज़ी ठीक है।'\n\nआप: 'और फोन नंबर — मोबाइल या स्टोर का लैंडलाइन?'\n\nकेमिस्ट: 'मोबाइल।'\n\nआप: 'परफेक्ट। डिलीवरी के लिए — आपका GST पता इस्तेमाल करूँ?\n\n(वे लॉजिस्टिक्स सवालों का जवाब दे रहे हैं — ऑर्डर गति में है।)",
    "keyPoints": [
      "Assumptive close is a confident mindset, not a trick",
      "Ask logistics questions, not 'will you buy'",
      "Design discussion assumes the order is happening",
      "Timing assumption + scarcity = natural close",
      "If they push back, you've found the real objection"
    ],
    "questions": [
      {
        "questionEn": "What is the core concept of 'The Assumptive Close — Act Like the Deal is Done'?",
        "questionHi": "'असम्पटिव क्लोज़ — जैसे डील हो चुकी हो' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "It's about product features only",
            "It's about applying The Assumptive Close to build trust and close sales",
            "It's about giving discounts",
            "It's about calling more people"
          ],
          "hi": [
            "यह केवल प्रोडक्ट फीचर के बारे में है",
            "यह भरोसा बनाने और सेल बंद करने के लिए असम्पटिव क्लोज़ लागू करने के बारे में है",
            "यह डिस्काउंट देने के बारे में है",
            "यह अधिक लोगों को कॉल करने के बारे में है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This topic is fundamentally about applying the principle to solve a real selling challenge.",
        "explanationHi": "यह टॉपिक मूल रूप से एक वास्तविक बिक्री चुनौती को हल करने के लिए सिद्धांत लागू करने के बारे में है।"
      },
      {
        "questionEn": "In medicine pouch sales, when should you use the 'The Assumptive Close' technique?",
        "questionHi": "मेडिसिन पाउच सेल्स में 'असम्पटिव क्लोज़' तकनीक का उपयोग कब करना चाहिए?",
        "options": {
          "en": [
            "Only at the beginning of the call",
            "Only when the customer objects",
            "Throughout the call when relevant, especially when facing resistance",
            "Only when closing"
          ],
          "hi": [
            "केवल कॉल की शुरुआत में",
            "केवल जब ग्राहक आपत्ति करे",
            "प्रतिरोध का सामना करते समय विशेष रूप से, जब प्रासंगिक हो",
            "केवल बंद करते समय"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Sales techniques are most powerful when applied contextually throughout the call.",
        "explanationHi": "सेल्स तकनीकें तब सबसे शक्तिशाली होती हैं जब पूरी कॉल में संदर्भानुसार लागू की जाती हैं।"
      },
      {
        "questionEn": "What is the first key point of 'The Assumptive Close — Act Like the Deal is Done'?",
        "questionHi": "'असम्पटिव क्लोज़ — जैसे डील हो चुकी हो' का पहला मुख्य बिंदु क्या है?",
        "options": {
          "en": [
            "Assumptive close is a confident mindset, not a trick",
            "Ask logistics questions, not 'will you buy'",
            "Focus on product features first",
            "Never follow up"
          ],
          "hi": [
            "Assumptive close is a confident mindset, not a trick",
            "Ask logistics questions, not 'will you buy'",
            "पहले प्रोडक्ट फीचर पर ध्यान दें",
            "कभी फॉलो-अप न करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "The first key point: Assumptive close is a confident mindset, not a trick",
        "explanationHi": "पहला मुख्य बिंदु: Assumptive close is a confident mindset, not a trick"
      },
      {
        "questionEn": "In the medicine pouch sales script for this topic, what makes the approach effective?",
        "questionHi": "इस टॉपिक की मेडिसिन पाउच सेल्स स्क्रिप्ट में क्या दृष्टिकोण को प्रभावी बनाता है?",
        "options": {
          "en": [
            "Starting with price information",
            "Connecting to the chemist's specific business reality and needs",
            "Listing all product specifications",
            "Using technical terms"
          ],
          "hi": [
            "कीमत की जानकारी से शुरू करना",
            "केमिस्ट की विशिष्ट व्यावसायिक वास्तविकता और ज़रूरतों से जोड़ना",
            "सभी प्रोडक्ट स्पेसिफिकेशन सूचीबद्ध करना",
            "तकनीकी शब्दों का उपयोग करना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Effective scripts connect product benefits to the customer's specific reality and needs.",
        "explanationHi": "प्रभावी स्क्रिप्ट उत्पाद के लाभों को ग्राहक की विशिष्ट वास्तविकता से जोड़ती है।"
      },
      {
        "questionEn": "The most important takeaway from 'The Assumptive Close — Act Like the Deal is Done' is:",
        "questionHi": "'असम्पटिव क्लोज़ — जैसे डील हो चुकी हो' से सबसे महत्वपूर्ण सीख है:",
        "options": {
          "en": [
            "If they push back, you've found the real objection",
            "Always offer a discount when using this technique",
            "Avoid this approach with difficult customers",
            "Only use this with large orders"
          ],
          "hi": [
            "If they push back, you've found the real objection",
            "इस तकनीक का उपयोग करते समय हमेशा डिस्काउंट दें",
            "कठिन ग्राहकों के साथ इस दृष्टिकोण से बचें",
            "केवल बड़े ऑर्डर के साथ इसका उपयोग करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key takeaway: If they push back, you've found the real objection",
        "explanationHi": "मुख्य सीख: If they push back, you've found the real objection"
      }
    ]
  },
  {
    "orderIndex": 19,
    "groupNumber": 4,
    "titleEn": "Storytelling in Sales — The Tale That Closes",
    "titleHi": "सेल्स में कहानी सुनाना — वो कहानी जो बंद करती है",
    "sourceBook": "To Sell is Human by Daniel Pink",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 11,
    "contentEn": "Daniel Pink's research shows that stories activate more parts of the brain than facts and figures. A well-told story creates empathy, memory, and desire — all key ingredients for a sale.\n\nWhy stories work in medicine pouch sales:\n- Facts: '70 GSM paper, multicolor printing, 5000 pieces, 15-day delivery'\n- Story: 'A pharmacy owner in Nashik told me that after switching to our branded pouches, he started getting calls from patients he hadn't seen in years — they'd found his number on the old pouch and called back.'\n\nThe story is remembered. The facts are forgotten.\n\nThe 3 Story Types for Medicine Pouch Sales:\n\n1. The Customer Success Story\n'We supply to a pharmacy in Pune's Deccan area. The owner, Sanjay bhai, was skeptical like most — said his patients don't notice packaging. 3 months after switching to branded pouches, two patients came in and said they recommended his store specifically because they had his number on their pouch and it felt more professional. He reordered before the first batch finished.'\n\n2. The Before/After Story\n'Before our pouches, the store gave out plain kraft bags. After — their name, logo, phone number on every bag. The owner told me patients started calling them directly instead of searching Google for a pharmacy. That's real brand recall.'\n\n3. The Problem-You-Didn't-Know Story\n'A chemist in Nagpur didn't realize that 40% of his new patients came from referrals — but the people referring were saying 'the pharmacy with the colored packet' because they didn't remember the name. The moment his name was on the packet — referrals went up because they could actually say the name.'\n\nThe story structure: Character → Problem → Solution → Outcome. Always end with a result the customer can feel.",
    "contentHi": "Daniel Pink की रिसर्च: कहानियाँ तथ्यों और आंकड़ों की तुलना में मस्तिष्क के अधिक हिस्सों को सक्रिय करती हैं।\n\n3 स्टोरी प्रकार:\n\n1. ग्राहक सफलता की कहानी: नाशिक की फार्मेसी जिसे पुराने मरीज़ों की कॉल आई\n2. पहले/बाद की कहानी: सादे क्राफ्ट बैग से ब्रांडेड पाउच तक\n3. वो समस्या जो आपको पता नहीं थी: नागपुर की फार्मेसी जहाँ रेफरल बढ़े\n\nकहानी संरचना: चरित्र → समस्या → समाधान → परिणाम",
    "scriptEn": "You: 'Sir, can I share something with you? I was speaking to a pharmacy owner in Solapur last month — similar setup to yours, busy store, 80-100 patients a day, plain paper bags.\n\nHe was like most people I speak to — said his customers don't care about packaging. We sent him a sample anyway. He liked the design, placed an order for 5000.\n\nThree months later, he calls me without me calling him. He says — Rahul, two patients came in this week and both mentioned they found my number on the old pouch from 6 months ago and called. They'd moved to another area but still came back to him because the number was right there.\n\nHe ordered 10,000 this time.\n\nSir, I'm not saying this will happen for you — but it's a pattern we see. The pouch does the marketing while you focus on the medicine. Shall we at least try with a design?'",
    "scriptHi": "आप: 'सर, क्या मैं आपके साथ कुछ शेयर कर सकता हूँ? पिछले महीने मैं सोलापुर के एक फार्मेसी मालिक से बात कर रहा था — आपकी तरह ही सेटअप, व्यस्त दुकान, 80-100 मरीज़/दिन, सादे पेपर बैग।\n\nवे अधिकांश लोगों की तरह थे — कहा कि उनके ग्राहकों को पैकेजिंग की परवाह नहीं है। हमने फिर भी एक सैम्पल भेजा। उन्होंने डिज़ाइन पसंद किया, 5000 का ऑर्डर दिया।\n\nतीन महीने बाद, वे बिना मेरी कॉल के मुझे फोन करते हैं। कहते हैं — Rahul, इस हफ्ते दो मरीज़ आए और दोनों ने कहा कि उन्हें पुराने पाउच पर मेरा नंबर मिला। उन्होंने 10,000 का ऑर्डर दिया।'",
    "keyPoints": [
      "Stories activate more brain regions than facts",
      "3 story types: success, before/after, hidden problem",
      "Story structure: Character→Problem→Solution→Outcome",
      "Always end with a specific, relatable outcome",
      "Share the story, then bridge to their situation"
    ],
    "questions": [
      {
        "questionEn": "What is the core concept of 'Storytelling in Sales — The Tale That Closes'?",
        "questionHi": "'सेल्स में कहानी सुनाना — वो कहानी जो बंद करती है' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "It's about product features only",
            "It's about applying Storytelling in Sales to build trust and close sales",
            "It's about giving discounts",
            "It's about calling more people"
          ],
          "hi": [
            "यह केवल प्रोडक्ट फीचर के बारे में है",
            "यह भरोसा बनाने और सेल बंद करने के लिए सेल्स में कहानी सुनाना लागू करने के बारे में है",
            "यह डिस्काउंट देने के बारे में है",
            "यह अधिक लोगों को कॉल करने के बारे में है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This topic is fundamentally about applying the principle to solve a real selling challenge.",
        "explanationHi": "यह टॉपिक मूल रूप से एक वास्तविक बिक्री चुनौती को हल करने के लिए सिद्धांत लागू करने के बारे में है।"
      },
      {
        "questionEn": "In medicine pouch sales, when should you use the 'Storytelling in Sales' technique?",
        "questionHi": "मेडिसिन पाउच सेल्स में 'सेल्स में कहानी सुनाना' तकनीक का उपयोग कब करना चाहिए?",
        "options": {
          "en": [
            "Only at the beginning of the call",
            "Only when the customer objects",
            "Throughout the call when relevant, especially when facing resistance",
            "Only when closing"
          ],
          "hi": [
            "केवल कॉल की शुरुआत में",
            "केवल जब ग्राहक आपत्ति करे",
            "प्रतिरोध का सामना करते समय विशेष रूप से, जब प्रासंगिक हो",
            "केवल बंद करते समय"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Sales techniques are most powerful when applied contextually throughout the call.",
        "explanationHi": "सेल्स तकनीकें तब सबसे शक्तिशाली होती हैं जब पूरी कॉल में संदर्भानुसार लागू की जाती हैं।"
      },
      {
        "questionEn": "What is the first key point of 'Storytelling in Sales — The Tale That Closes'?",
        "questionHi": "'सेल्स में कहानी सुनाना — वो कहानी जो बंद करती है' का पहला मुख्य बिंदु क्या है?",
        "options": {
          "en": [
            "Stories activate more brain regions than facts",
            "3 story types: success, before/after, hidden problem",
            "Focus on product features first",
            "Never follow up"
          ],
          "hi": [
            "Stories activate more brain regions than facts",
            "3 story types: success, before/after, hidden problem",
            "पहले प्रोडक्ट फीचर पर ध्यान दें",
            "कभी फॉलो-अप न करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "The first key point: Stories activate more brain regions than facts",
        "explanationHi": "पहला मुख्य बिंदु: Stories activate more brain regions than facts"
      },
      {
        "questionEn": "In the medicine pouch sales script for this topic, what makes the approach effective?",
        "questionHi": "इस टॉपिक की मेडिसिन पाउच सेल्स स्क्रिप्ट में क्या दृष्टिकोण को प्रभावी बनाता है?",
        "options": {
          "en": [
            "Starting with price information",
            "Connecting to the chemist's specific business reality and needs",
            "Listing all product specifications",
            "Using technical terms"
          ],
          "hi": [
            "कीमत की जानकारी से शुरू करना",
            "केमिस्ट की विशिष्ट व्यावसायिक वास्तविकता और ज़रूरतों से जोड़ना",
            "सभी प्रोडक्ट स्पेसिफिकेशन सूचीबद्ध करना",
            "तकनीकी शब्दों का उपयोग करना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Effective scripts connect product benefits to the customer's specific reality and needs.",
        "explanationHi": "प्रभावी स्क्रिप्ट उत्पाद के लाभों को ग्राहक की विशिष्ट वास्तविकता से जोड़ती है।"
      },
      {
        "questionEn": "The most important takeaway from 'Storytelling in Sales — The Tale That Closes' is:",
        "questionHi": "'सेल्स में कहानी सुनाना — वो कहानी जो बंद करती है' से सबसे महत्वपूर्ण सीख है:",
        "options": {
          "en": [
            "Share the story, then bridge to their situation",
            "Always offer a discount when using this technique",
            "Avoid this approach with difficult customers",
            "Only use this with large orders"
          ],
          "hi": [
            "Share the story, then bridge to their situation",
            "इस तकनीक का उपयोग करते समय हमेशा डिस्काउंट दें",
            "कठिन ग्राहकों के साथ इस दृष्टिकोण से बचें",
            "केवल बड़े ऑर्डर के साथ इसका उपयोग करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key takeaway: Share the story, then bridge to their situation",
        "explanationHi": "मुख्य सीख: Share the story, then bridge to their situation"
      }
    ]
  },
  {
    "orderIndex": 20,
    "groupNumber": 4,
    "titleEn": "Referral Selling — Turn One Customer Into Ten",
    "titleHi": "रेफरल सेलिंग — एक ग्राहक को दस में बदलें",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 10,
    "contentEn": "The most efficient sales happen when your existing customers bring new ones. In medicine pouch sales, one happy chemist can introduce you to 5-10 others in their market.\n\nWhy referrals are gold in this business:\n- A referred chemist already has social proof (their colleague uses you)\n- The sales cycle is 3-5x shorter\n- Trust is pre-established\n- Conversion rate from referral is 70-80% vs 10-15% cold calling\n\nThe 3 Referral Moments:\n\nMoment 1: At the time of design approval\n'Sir, I'm glad you liked the design. Quick question — is there another pharmacy owner in your area or building who you think would benefit from this? I'd love to give them the same offer.'\n\nMoment 2: 15 days after delivery\n'Bhai, how are the pouches working out? Any feedback?' (If positive) 'That's great to hear! Do you know 2-3 other pharmacy owners I could speak to? I'll mention your name — and if they order, I'll keep that in mind for your next reorder.'\n\nMoment 3: At reorder\n'Thank you for the reorder, sir. Before I go — do you know anyone in your market I should speak to?' (At reorder, they're maximally happy — best time to ask.)\n\nThe Referral Incentive for Medicine Pouches:\n'For every store you refer that places an order, I'll add 500 free pouches to your next reorder — at no cost to you. Fair?'\n\nThe warm introduction script:\n'Would you be comfortable if I mentioned your name when I call them? Something like — Sir, I supply [your store name] in your area, they suggested I speak with you.' — This creates an instant trust bridge.\n\nNever ask for referrals before you've delivered value. The right time is when they're happiest.",
    "contentHi": "मौजूदा ग्राहकों से रेफरल सबसे कुशल सेल्स है।\n\n3 रेफरल क्षण:\n\nक्षण 1: डिज़ाइन अनुमोदन के समय\nक्षण 2: डिलीवरी के 15 दिन बाद\nक्षण 3: रीऑर्डर पर\n\nरेफरल प्रोत्साहन: 'हर रेफर किए गए स्टोर के ऑर्डर पर अगले रीऑर्डर में 500 मुफ्त पाउच।'\n\nगर्म परिचय स्क्रिप्ट: 'क्या मैं उन्हें कॉल करते समय आपका नाम उल्लेख कर सकता हूँ?'",
    "scriptEn": "15 days after delivery call:\n\nYou: 'Hello Rajesh bhai, Rahul here from RarePrint. How are the pouches coming along? Are they working out well?'\n\nChemist: 'Yes, actually patients have been noticing them. Good quality.'\n\nYou: 'That's wonderful to hear — truly. Bhai, I have a small request. Is there another pharmacy owner in your market — or maybe someone in your building or on the same road — who you think would benefit from the same thing? I'm not asking you to sell them — just an introduction. I'll handle the rest. And if they order, I'll add 500 extra pieces free on your next reorder as a thank you.'\n\nChemist: 'Yes, there's a store two shops down — Kapoor Medical. You can use my name.'\n\nYou: 'Perfect. I'll call them today and mention your name. Thank you so much.'",
    "scriptHi": "डिलीवरी के 15 दिन बाद:\n\nआप: 'नमस्ते Rajesh bhai, Rahul यहाँ RarePrint से। पाउच कैसे चल रहे हैं?'\n\nकेमिस्ट: 'हाँ, मरीज़ नोटिस कर रहे हैं। अच्छी क्वालिटी।'\n\nआप: 'यह सुनकर अच्छा लगा। भाई, एक छोटी रिक्वेस्ट। क्या आपके बाज़ार में कोई और फार्मेसी मालिक है जो इससे लाभ उठाएगा? अगर वे ऑर्डर करते हैं, तो आपके अगले रीऑर्डर पर 500 मुफ्त पीस जोड़ूँगा।'\n\nकेमिस्ट: 'हाँ, दो दुकानें आगे Kapoor Medical है। मेरा नाम ले सकते हैं।'",
    "keyPoints": [
      "Ask for referrals when customer is happiest",
      "3 moments: design approval, post-delivery, reorder",
      "Referral conversion rate is 70-80% vs 10-15% cold",
      "Warm introduction using their name bridges trust instantly",
      "Offer referral incentive: 500 free pieces on next reorder"
    ],
    "questions": [
      {
        "questionEn": "What is the core concept of 'Referral Selling — Turn One Customer Into Ten'?",
        "questionHi": "'रेफरल सेलिंग — एक ग्राहक को दस में बदलें' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "It's about product features only",
            "It's about applying Referral Selling to build trust and close sales",
            "It's about giving discounts",
            "It's about calling more people"
          ],
          "hi": [
            "यह केवल प्रोडक्ट फीचर के बारे में है",
            "यह भरोसा बनाने और सेल बंद करने के लिए रेफरल सेलिंग लागू करने के बारे में है",
            "यह डिस्काउंट देने के बारे में है",
            "यह अधिक लोगों को कॉल करने के बारे में है"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This topic is fundamentally about applying the principle to solve a real selling challenge.",
        "explanationHi": "यह टॉपिक मूल रूप से एक वास्तविक बिक्री चुनौती को हल करने के लिए सिद्धांत लागू करने के बारे में है।"
      },
      {
        "questionEn": "In medicine pouch sales, when should you use the 'Referral Selling' technique?",
        "questionHi": "मेडिसिन पाउच सेल्स में 'रेफरल सेलिंग' तकनीक का उपयोग कब करना चाहिए?",
        "options": {
          "en": [
            "Only at the beginning of the call",
            "Only when the customer objects",
            "Throughout the call when relevant, especially when facing resistance",
            "Only when closing"
          ],
          "hi": [
            "केवल कॉल की शुरुआत में",
            "केवल जब ग्राहक आपत्ति करे",
            "प्रतिरोध का सामना करते समय विशेष रूप से, जब प्रासंगिक हो",
            "केवल बंद करते समय"
          ]
        },
        "correctIndex": 2,
        "explanationEn": "Sales techniques are most powerful when applied contextually throughout the call.",
        "explanationHi": "सेल्स तकनीकें तब सबसे शक्तिशाली होती हैं जब पूरी कॉल में संदर्भानुसार लागू की जाती हैं।"
      },
      {
        "questionEn": "What is the first key point of 'Referral Selling — Turn One Customer Into Ten'?",
        "questionHi": "'रेफरल सेलिंग — एक ग्राहक को दस में बदलें' का पहला मुख्य बिंदु क्या है?",
        "options": {
          "en": [
            "Ask for referrals when customer is happiest",
            "3 moments: design approval, post-delivery, reorder",
            "Focus on product features first",
            "Never follow up"
          ],
          "hi": [
            "Ask for referrals when customer is happiest",
            "3 moments: design approval, post-delivery, reorder",
            "पहले प्रोडक्ट फीचर पर ध्यान दें",
            "कभी फॉलो-अप न करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "The first key point: Ask for referrals when customer is happiest",
        "explanationHi": "पहला मुख्य बिंदु: Ask for referrals when customer is happiest"
      },
      {
        "questionEn": "In the medicine pouch sales script for this topic, what makes the approach effective?",
        "questionHi": "इस टॉपिक की मेडिसिन पाउच सेल्स स्क्रिप्ट में क्या दृष्टिकोण को प्रभावी बनाता है?",
        "options": {
          "en": [
            "Starting with price information",
            "Connecting to the chemist's specific business reality and needs",
            "Listing all product specifications",
            "Using technical terms"
          ],
          "hi": [
            "कीमत की जानकारी से शुरू करना",
            "केमिस्ट की विशिष्ट व्यावसायिक वास्तविकता और ज़रूरतों से जोड़ना",
            "सभी प्रोडक्ट स्पेसिफिकेशन सूचीबद्ध करना",
            "तकनीकी शब्दों का उपयोग करना"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "Effective scripts connect product benefits to the customer's specific reality and needs.",
        "explanationHi": "प्रभावी स्क्रिप्ट उत्पाद के लाभों को ग्राहक की विशिष्ट वास्तविकता से जोड़ती है।"
      },
      {
        "questionEn": "The most important takeaway from 'Referral Selling — Turn One Customer Into Ten' is:",
        "questionHi": "'रेफरल सेलिंग — एक ग्राहक को दस में बदलें' से सबसे महत्वपूर्ण सीख है:",
        "options": {
          "en": [
            "Offer referral incentive: 500 free pieces on next reorder",
            "Always offer a discount when using this technique",
            "Avoid this approach with difficult customers",
            "Only use this with large orders"
          ],
          "hi": [
            "Offer referral incentive: 500 free pieces on next reorder",
            "इस तकनीक का उपयोग करते समय हमेशा डिस्काउंट दें",
            "कठिन ग्राहकों के साथ इस दृष्टिकोण से बचें",
            "केवल बड़े ऑर्डर के साथ इसका उपयोग करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key takeaway: Offer referral incentive: 500 free pieces on next reorder",
        "explanationHi": "मुख्य सीख: Offer referral incentive: 500 free pieces on next reorder"
      }
    ]
  },
  {
    "orderIndex": 21,
    "groupNumber": 5,
    "titleEn": "Emotional Intelligence in Sales — Reading the Room",
    "titleHi": "सेल्स में भावनात्मक बुद्धिमत्ता",
    "sourceBook": "Emotional Intelligence by Daniel Goleman",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 12,
    "contentEn": "This topic covers Emotional Intelligence in Sales — Reading the Room — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Emotional Intelligence by Daniel Goleman: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- EQ means sensing and adjusting to customer emotional state in real time\n- Self-regulation: stay calm and curious when chemist is rude\n- Empathy: 'I can tell you're busy — can I call back tomorrow?'\n- Acknowledging 'I know you get many calls' immediately differentiates you\n- Exit gracefully when timing is wrong — reschedule with specific time\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक सेल्स में भावनात्मक बुद्धिमत्ता को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nEmotional Intelligence by Daniel Goleman से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- EQ means sensing and adjusting to customer emotional state in real time\n- Self-regulation: stay calm and curious when chemist is rude\n- Empathy: 'I can tell you're busy — can I call back tomorrow?'\n- Acknowledging 'I know you get many calls' immediately differentiates you\n- Exit gracefully when timing is wrong — reschedule with specific time\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Emotional Intelligence in Sales in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: EQ means sensing and adjusting to customer emotional state in real time\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में सेल्स में भावनात्मक बुद्धिमत्ता लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: EQ means sensing and adjusting to customer emotional state in real time",
    "keyPoints": [
      "EQ means sensing and adjusting to customer emotional state in real time",
      "Self-regulation: stay calm and curious when chemist is rude",
      "Empathy: 'I can tell you're busy — can I call back tomorrow?'",
      "Acknowledging 'I know you get many calls' immediately differentiates you",
      "Exit gracefully when timing is wrong — reschedule with specific time"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Emotional Intelligence in Sales'?",
        "questionHi": "'सेल्स में भावनात्मक बुद्धिमत्ता' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "EQ means sensing and adjusting to customer emotional state in real time",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "EQ means sensing and adjusting to customer emotional state in real time",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: EQ means sensing and adjusting to customer emotional state in real time",
        "explanationHi": "मुख्य सिद्धांत: EQ means sensing and adjusting to customer emotional state in real time"
      },
      {
        "questionEn": "In medicine pouch sales, 'Emotional Intelligence in Sales' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'सेल्स में भावनात्मक बुद्धिमत्ता' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Emotional Intelligence in Sales'?",
        "questionHi": "'सेल्स में भावनात्मक बुद्धिमत्ता' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Emotional Intelligence by Daniel Goleman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Emotional Intelligence by Daniel Goleman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Emotional Intelligence by Daniel Goleman",
        "explanationHi": "स्रोत: Emotional Intelligence by Daniel Goleman"
      },
      {
        "questionEn": "Key point 2 of 'Emotional Intelligence in Sales — Reading the Room':",
        "questionHi": "'सेल्स में भावनात्मक बुद्धिमत्ता' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Self-regulation: stay calm and curious when chemist is rude",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Self-regulation: stay calm and curious when chemist is rude",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Self-regulation: stay calm and curious when chemist is rude",
        "explanationHi": "मुख्य बिंदु 2: Self-regulation: stay calm and curious when chemist is rude"
      },
      {
        "questionEn": "The final key takeaway from 'Emotional Intelligence in Sales — Reading the Room' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'सेल्स में भावनात्मक बुद्धिमत्ता' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Exit gracefully when timing is wrong — reschedule with specific time",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Exit gracefully when timing is wrong — reschedule with specific time",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Exit gracefully when timing is wrong — reschedule with specific time",
        "explanationHi": "अंतिम सीख: Exit gracefully when timing is wrong — reschedule with specific time"
      }
    ]
  },
  {
    "orderIndex": 22,
    "groupNumber": 5,
    "titleEn": "The Power of Silence — When Not Talking Wins Deals",
    "titleHi": "चुप्पी की शक्ति",
    "sourceBook": "Never Split the Difference by Chris Voss",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "This topic covers The Power of Silence — When Not Talking Wins Deals — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Never Split the Difference by Chris Voss: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Silence after stating price = confidence in your pricing\n- Never justify price before they object\n- Post-story silence lets the message land deeper\n- Post-objection silence shows you truly heard them\n- Record calls to count how often you interrupt\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक चुप्पी की शक्ति को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nNever Split the Difference by Chris Voss से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Silence after stating price = confidence in your pricing\n- Never justify price before they object\n- Post-story silence lets the message land deeper\n- Post-objection silence shows you truly heard them\n- Record calls to count how often you interrupt\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Power of Silence in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Silence after stating price = confidence in your pricing\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में चुप्पी की शक्ति लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Silence after stating price = confidence in your pricing",
    "keyPoints": [
      "Silence after stating price = confidence in your pricing",
      "Never justify price before they object",
      "Post-story silence lets the message land deeper",
      "Post-objection silence shows you truly heard them",
      "Record calls to count how often you interrupt"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Power of Silence'?",
        "questionHi": "'चुप्पी की शक्ति' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Silence after stating price = confidence in your pricing",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Silence after stating price = confidence in your pricing",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Silence after stating price = confidence in your pricing",
        "explanationHi": "मुख्य सिद्धांत: Silence after stating price = confidence in your pricing"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Power of Silence' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'चुप्पी की शक्ति' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Power of Silence'?",
        "questionHi": "'चुप्पी की शक्ति' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Never Split the Difference by Chris Voss",
        "explanationHi": "स्रोत: Never Split the Difference by Chris Voss"
      },
      {
        "questionEn": "Key point 2 of 'The Power of Silence — When Not Talking Wins Deals':",
        "questionHi": "'चुप्पी की शक्ति' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Never justify price before they object",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Never justify price before they object",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Never justify price before they object",
        "explanationHi": "मुख्य बिंदु 2: Never justify price before they object"
      },
      {
        "questionEn": "The final key takeaway from 'The Power of Silence — When Not Talking Wins Deals' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'चुप्पी की शक्ति' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Record calls to count how often you interrupt",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Record calls to count how often you interrupt",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Record calls to count how often you interrupt",
        "explanationHi": "अंतिम सीख: Record calls to count how often you interrupt"
      }
    ]
  },
  {
    "orderIndex": 23,
    "groupNumber": 5,
    "titleEn": "Prospecting Like a Machine — Daily Call Pipeline",
    "titleHi": "मशीन की तरह प्रॉस्पेक्टिंग",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 13,
    "contentEn": "This topic covers Prospecting Like a Machine — Daily Call Pipeline — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- 20 calls/day formula: 400 calls/month = 8 new accounts\n- Block 2 hours daily as untouchable calling time\n- Hot/Warm/Cold lists organize your entire pipeline\n- Geography method: call all stores in one area before moving\n- Track calls, samples sent, and orders in a daily sheet\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक मशीन की तरह प्रॉस्पेक्टिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- 20 calls/day formula: 400 calls/month = 8 new accounts\n- Block 2 hours daily as untouchable calling time\n- Hot/Warm/Cold lists organize your entire pipeline\n- Geography method: call all stores in one area before moving\n- Track calls, samples sent, and orders in a daily sheet\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Prospecting Like a Machine in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: 20 calls/day formula: 400 calls/month = 8 new accounts\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में मशीन की तरह प्रॉस्पेक्टिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: 20 calls/day formula: 400 calls/month = 8 new accounts",
    "keyPoints": [
      "20 calls/day formula: 400 calls/month = 8 new accounts",
      "Block 2 hours daily as untouchable calling time",
      "Hot/Warm/Cold lists organize your entire pipeline",
      "Geography method: call all stores in one area before moving",
      "Track calls, samples sent, and orders in a daily sheet"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Prospecting Like a Machine'?",
        "questionHi": "'मशीन की तरह प्रॉस्पेक्टिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "20 calls/day formula: 400 calls/month = 8 new accounts",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "20 calls/day formula: 400 calls/month = 8 new accounts",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: 20 calls/day formula: 400 calls/month = 8 new accounts",
        "explanationHi": "मुख्य सिद्धांत: 20 calls/day formula: 400 calls/month = 8 new accounts"
      },
      {
        "questionEn": "In medicine pouch sales, 'Prospecting Like a Machine' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'मशीन की तरह प्रॉस्पेक्टिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Prospecting Like a Machine'?",
        "questionHi": "'मशीन की तरह प्रॉस्पेक्टिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'Prospecting Like a Machine — Daily Call Pipeline':",
        "questionHi": "'मशीन की तरह प्रॉस्पेक्टिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Block 2 hours daily as untouchable calling time",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Block 2 hours daily as untouchable calling time",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Block 2 hours daily as untouchable calling time",
        "explanationHi": "मुख्य बिंदु 2: Block 2 hours daily as untouchable calling time"
      },
      {
        "questionEn": "The final key takeaway from 'Prospecting Like a Machine — Daily Call Pipeline' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'मशीन की तरह प्रॉस्पेक्टिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Track calls, samples sent, and orders in a daily sheet",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Track calls, samples sent, and orders in a daily sheet",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Track calls, samples sent, and orders in a daily sheet",
        "explanationHi": "अंतिम सीख: Track calls, samples sent, and orders in a daily sheet"
      }
    ]
  },
  {
    "orderIndex": 24,
    "groupNumber": 5,
    "titleEn": "Asking for the Order — The Direct Close",
    "titleHi": "ऑर्डर के लिए सीधे पूछना",
    "sourceBook": "Sell or Be Sold by Grant Cardone",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 10,
    "contentEn": "This topic covers Asking for the Order — The Direct Close — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Sell or Be Sold by Grant Cardone: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Most salespeople never ask — always ask for the order\n- 4 close types: Direct, Either/Or, Next-Step, Summary\n- 3-Ask Rule: try 3 different approaches before moving on\n- Either/Or close: both options result in a yes\n- Design proof = first step that commits them to the process\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक ऑर्डर के लिए सीधे पूछना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nSell or Be Sold by Grant Cardone से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Most salespeople never ask — always ask for the order\n- 4 close types: Direct, Either/Or, Next-Step, Summary\n- 3-Ask Rule: try 3 different approaches before moving on\n- Either/Or close: both options result in a yes\n- Design proof = first step that commits them to the process\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Asking for the Order in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Most salespeople never ask — always ask for the order\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में ऑर्डर के लिए सीधे पूछना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Most salespeople never ask — always ask for the order",
    "keyPoints": [
      "Most salespeople never ask — always ask for the order",
      "4 close types: Direct, Either/Or, Next-Step, Summary",
      "3-Ask Rule: try 3 different approaches before moving on",
      "Either/Or close: both options result in a yes",
      "Design proof = first step that commits them to the process"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Asking for the Order'?",
        "questionHi": "'ऑर्डर के लिए सीधे पूछना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Most salespeople never ask — always ask for the order",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Most salespeople never ask — always ask for the order",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Most salespeople never ask — always ask for the order",
        "explanationHi": "मुख्य सिद्धांत: Most salespeople never ask — always ask for the order"
      },
      {
        "questionEn": "In medicine pouch sales, 'Asking for the Order' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'ऑर्डर के लिए सीधे पूछना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Asking for the Order'?",
        "questionHi": "'ऑर्डर के लिए सीधे पूछना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Sell or Be Sold by Grant Cardone",
        "explanationHi": "स्रोत: Sell or Be Sold by Grant Cardone"
      },
      {
        "questionEn": "Key point 2 of 'Asking for the Order — The Direct Close':",
        "questionHi": "'ऑर्डर के लिए सीधे पूछना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "4 close types: Direct, Either/Or, Next-Step, Summary",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "4 close types: Direct, Either/Or, Next-Step, Summary",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: 4 close types: Direct, Either/Or, Next-Step, Summary",
        "explanationHi": "मुख्य बिंदु 2: 4 close types: Direct, Either/Or, Next-Step, Summary"
      },
      {
        "questionEn": "The final key takeaway from 'Asking for the Order — The Direct Close' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'ऑर्डर के लिए सीधे पूछना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Design proof = first step that commits them to the process",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Design proof = first step that commits them to the process",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Design proof = first step that commits them to the process",
        "explanationHi": "अंतिम सीख: Design proof = first step that commits them to the process"
      }
    ]
  },
  {
    "orderIndex": 25,
    "groupNumber": 5,
    "titleEn": "Handling Rejection — Bouncing Back Stronger",
    "titleHi": "अस्वीकृति से मज़बूत वापसी",
    "sourceBook": "The Psychology of Selling by Brian Tracy",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "This topic covers Handling Rejection — Bouncing Back Stronger — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Psychology of Selling by Brian Tracy: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Rejection is almost never personal — it's usually timing\n- Numbers reframe: each 'no' is worth a % of your order value\n- Ask 'what can I do differently?' not 'why did they reject me?'\n- Physical reset between calls: stand, stretch, breathe, water\n- Success recall before next call: remember your last win\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक अस्वीकृति से मज़बूत वापसी को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Psychology of Selling by Brian Tracy से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Rejection is almost never personal — it's usually timing\n- Numbers reframe: each 'no' is worth a % of your order value\n- Ask 'what can I do differently?' not 'why did they reject me?'\n- Physical reset between calls: stand, stretch, breathe, water\n- Success recall before next call: remember your last win\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Handling Rejection in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Rejection is almost never personal — it's usually timing\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में अस्वीकृति से मज़बूत वापसी लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Rejection is almost never personal — it's usually timing",
    "keyPoints": [
      "Rejection is almost never personal — it's usually timing",
      "Numbers reframe: each 'no' is worth a % of your order value",
      "Ask 'what can I do differently?' not 'why did they reject me?'",
      "Physical reset between calls: stand, stretch, breathe, water",
      "Success recall before next call: remember your last win"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Handling Rejection'?",
        "questionHi": "'अस्वीकृति से मज़बूत वापसी' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Rejection is almost never personal — it's usually timing",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Rejection is almost never personal — it's usually timing",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Rejection is almost never personal — it's usually timing",
        "explanationHi": "मुख्य सिद्धांत: Rejection is almost never personal — it's usually timing"
      },
      {
        "questionEn": "In medicine pouch sales, 'Handling Rejection' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'अस्वीकृति से मज़बूत वापसी' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Handling Rejection'?",
        "questionHi": "'अस्वीकृति से मज़बूत वापसी' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Psychology of Selling by Brian Tracy",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Psychology of Selling by Brian Tracy",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Psychology of Selling by Brian Tracy",
        "explanationHi": "स्रोत: The Psychology of Selling by Brian Tracy"
      },
      {
        "questionEn": "Key point 2 of 'Handling Rejection — Bouncing Back Stronger':",
        "questionHi": "'अस्वीकृति से मज़बूत वापसी' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Numbers reframe: each 'no' is worth a % of your order value",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Numbers reframe: each 'no' is worth a % of your order value",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Numbers reframe: each 'no' is worth a % of your order value",
        "explanationHi": "मुख्य बिंदु 2: Numbers reframe: each 'no' is worth a % of your order value"
      },
      {
        "questionEn": "The final key takeaway from 'Handling Rejection — Bouncing Back Stronger' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'अस्वीकृति से मज़बूत वापसी' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Success recall before next call: remember your last win",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Success recall before next call: remember your last win",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Success recall before next call: remember your last win",
        "explanationHi": "अंतिम सीख: Success recall before next call: remember your last win"
      }
    ]
  },
  {
    "orderIndex": 26,
    "groupNumber": 6,
    "titleEn": "Advanced Rapport — Going Beyond Small Talk",
    "titleHi": "उन्नत तालमेल",
    "sourceBook": "How to Win Friends by Dale Carnegie",
    "difficulty": "ADVANCED",
    "estimatedMins": 12,
    "contentEn": "This topic covers Advanced Rapport — Going Beyond Small Talk — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from How to Win Friends by Dale Carnegie: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- 3 rapport levels: pleasantries, personal, philosophical alignment\n- Ask: 'What are you most proud of in your pharmacy?'\n- Their answer reveals core value — lead your pitch with that\n- Honest limitation + confident strength = deep credibility\n- Chemists who feel deeply understood become loyal reorders\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक उन्नत तालमेल को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nHow to Win Friends by Dale Carnegie से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- 3 rapport levels: pleasantries, personal, philosophical alignment\n- Ask: 'What are you most proud of in your pharmacy?'\n- Their answer reveals core value — lead your pitch with that\n- Honest limitation + confident strength = deep credibility\n- Chemists who feel deeply understood become loyal reorders\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Advanced Rapport in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: 3 rapport levels: pleasantries, personal, philosophical alignment\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में उन्नत तालमेल लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: 3 rapport levels: pleasantries, personal, philosophical alignment",
    "keyPoints": [
      "3 rapport levels: pleasantries, personal, philosophical alignment",
      "Ask: 'What are you most proud of in your pharmacy?'",
      "Their answer reveals core value — lead your pitch with that",
      "Honest limitation + confident strength = deep credibility",
      "Chemists who feel deeply understood become loyal reorders"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Advanced Rapport'?",
        "questionHi": "'उन्नत तालमेल' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "3 rapport levels: pleasantries, personal, philosophical alignment",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "3 rapport levels: pleasantries, personal, philosophical alignment",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: 3 rapport levels: pleasantries, personal, philosophical alignment",
        "explanationHi": "मुख्य सिद्धांत: 3 rapport levels: pleasantries, personal, philosophical alignment"
      },
      {
        "questionEn": "In medicine pouch sales, 'Advanced Rapport' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'उन्नत तालमेल' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Advanced Rapport'?",
        "questionHi": "'उन्नत तालमेल' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "How to Win Friends by Dale Carnegie",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "How to Win Friends by Dale Carnegie",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: How to Win Friends by Dale Carnegie",
        "explanationHi": "स्रोत: How to Win Friends by Dale Carnegie"
      },
      {
        "questionEn": "Key point 2 of 'Advanced Rapport — Going Beyond Small Talk':",
        "questionHi": "'उन्नत तालमेल' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Ask: 'What are you most proud of in your pharmacy?'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Ask: 'What are you most proud of in your pharmacy?'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Ask: 'What are you most proud of in your pharmacy?'",
        "explanationHi": "मुख्य बिंदु 2: Ask: 'What are you most proud of in your pharmacy?'"
      },
      {
        "questionEn": "The final key takeaway from 'Advanced Rapport — Going Beyond Small Talk' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'उन्नत तालमेल' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Chemists who feel deeply understood become loyal reorders",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Chemists who feel deeply understood become loyal reorders",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Chemists who feel deeply understood become loyal reorders",
        "explanationHi": "अंतिम सीख: Chemists who feel deeply understood become loyal reorders"
      }
    ]
  },
  {
    "orderIndex": 27,
    "groupNumber": 6,
    "titleEn": "Price Anchoring — Setting the Reference Point",
    "titleHi": "प्राइस एंकरिंग",
    "sourceBook": "Influence by Robert Cialdini",
    "difficulty": "ADVANCED",
    "estimatedMins": 11,
    "contentEn": "This topic covers Price Anchoring — Setting the Reference Point — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Influence by Robert Cialdini: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Set your price anchor before the chemist sets theirs\n- High anchor first: mention premium range before standard\n- Competitor anchor: 'others charge more, we are at Rs 3'\n- Volume anchor: regular clients order 50,000 makes 5000 feel small\n- Per-day anchor: Rs 41/day is far more manageable than Rs 15,000\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक प्राइस एंकरिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nInfluence by Robert Cialdini से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Set your price anchor before the chemist sets theirs\n- High anchor first: mention premium range before standard\n- Competitor anchor: 'others charge more, we are at Rs 3'\n- Volume anchor: regular clients order 50,000 makes 5000 feel small\n- Per-day anchor: Rs 41/day is far more manageable than Rs 15,000\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Price Anchoring in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Set your price anchor before the chemist sets theirs\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में प्राइस एंकरिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Set your price anchor before the chemist sets theirs",
    "keyPoints": [
      "Set your price anchor before the chemist sets theirs",
      "High anchor first: mention premium range before standard",
      "Competitor anchor: 'others charge more, we are at Rs 3'",
      "Volume anchor: regular clients order 50,000 makes 5000 feel small",
      "Per-day anchor: Rs 41/day is far more manageable than Rs 15,000"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Price Anchoring'?",
        "questionHi": "'प्राइस एंकरिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Set your price anchor before the chemist sets theirs",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Set your price anchor before the chemist sets theirs",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Set your price anchor before the chemist sets theirs",
        "explanationHi": "मुख्य सिद्धांत: Set your price anchor before the chemist sets theirs"
      },
      {
        "questionEn": "In medicine pouch sales, 'Price Anchoring' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'प्राइस एंकरिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Price Anchoring'?",
        "questionHi": "'प्राइस एंकरिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Influence by Robert Cialdini",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Influence by Robert Cialdini",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Influence by Robert Cialdini",
        "explanationHi": "स्रोत: Influence by Robert Cialdini"
      },
      {
        "questionEn": "Key point 2 of 'Price Anchoring — Setting the Reference Point':",
        "questionHi": "'प्राइस एंकरिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "High anchor first: mention premium range before standard",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "High anchor first: mention premium range before standard",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: High anchor first: mention premium range before standard",
        "explanationHi": "मुख्य बिंदु 2: High anchor first: mention premium range before standard"
      },
      {
        "questionEn": "The final key takeaway from 'Price Anchoring — Setting the Reference Point' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'प्राइस एंकरिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Per-day anchor: Rs 41/day is far more manageable than Rs 15,000",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Per-day anchor: Rs 41/day is far more manageable than Rs 15,000",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Per-day anchor: Rs 41/day is far more manageable than Rs 15,000",
        "explanationHi": "अंतिम सीख: Per-day anchor: Rs 41/day is far more manageable than Rs 15,000"
      }
    ]
  },
  {
    "orderIndex": 28,
    "groupNumber": 6,
    "titleEn": "Loss Aversion — Selling What They Might Lose",
    "titleHi": "लॉस एवर्जन",
    "sourceBook": "Thinking Fast and Slow by Daniel Kahneman",
    "difficulty": "ADVANCED",
    "estimatedMins": 12,
    "contentEn": "This topic covers Loss Aversion — Selling What They Might Lose — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Thinking Fast and Slow by Daniel Kahneman: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Loss aversion: pain of loss 2x stronger than equal gain\n- Loss frame: patients leave with nothing that remembers your store\n- Competitor frame: they are ordering branded pouches — will you?\n- Referral frame: they cannot recommend you if they forget your name\n- Time loss: every month waiting equals 900 missed impressions\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक लॉस एवर्जन को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThinking Fast and Slow by Daniel Kahneman से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Loss aversion: pain of loss 2x stronger than equal gain\n- Loss frame: patients leave with nothing that remembers your store\n- Competitor frame: they are ordering branded pouches — will you?\n- Referral frame: they cannot recommend you if they forget your name\n- Time loss: every month waiting equals 900 missed impressions\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Loss Aversion in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Loss aversion: pain of loss 2x stronger than equal gain\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में लॉस एवर्जन लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Loss aversion: pain of loss 2x stronger than equal gain",
    "keyPoints": [
      "Loss aversion: pain of loss 2x stronger than equal gain",
      "Loss frame: patients leave with nothing that remembers your store",
      "Competitor frame: they are ordering branded pouches — will you?",
      "Referral frame: they cannot recommend you if they forget your name",
      "Time loss: every month waiting equals 900 missed impressions"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Loss Aversion'?",
        "questionHi": "'लॉस एवर्जन' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Loss aversion: pain of loss 2x stronger than equal gain",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Loss aversion: pain of loss 2x stronger than equal gain",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Loss aversion: pain of loss 2x stronger than equal gain",
        "explanationHi": "मुख्य सिद्धांत: Loss aversion: pain of loss 2x stronger than equal gain"
      },
      {
        "questionEn": "In medicine pouch sales, 'Loss Aversion' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'लॉस एवर्जन' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Loss Aversion'?",
        "questionHi": "'लॉस एवर्जन' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Thinking Fast and Slow by Daniel Kahneman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Thinking Fast and Slow by Daniel Kahneman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Thinking Fast and Slow by Daniel Kahneman",
        "explanationHi": "स्रोत: Thinking Fast and Slow by Daniel Kahneman"
      },
      {
        "questionEn": "Key point 2 of 'Loss Aversion — Selling What They Might Lose':",
        "questionHi": "'लॉस एवर्जन' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Loss frame: patients leave with nothing that remembers your store",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Loss frame: patients leave with nothing that remembers your store",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Loss frame: patients leave with nothing that remembers your store",
        "explanationHi": "मुख्य बिंदु 2: Loss frame: patients leave with nothing that remembers your store"
      },
      {
        "questionEn": "The final key takeaway from 'Loss Aversion — Selling What They Might Lose' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'लॉस एवर्जन' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Time loss: every month waiting equals 900 missed impressions",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Time loss: every month waiting equals 900 missed impressions",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Time loss: every month waiting equals 900 missed impressions",
        "explanationHi": "अंतिम सीख: Time loss: every month waiting equals 900 missed impressions"
      }
    ]
  },
  {
    "orderIndex": 29,
    "groupNumber": 6,
    "titleEn": "The Psychology of Pricing — How Buyers Decide Value",
    "titleHi": "मूल्य निर्धारण का मनोविज्ञान",
    "sourceBook": "Predictably Irrational by Dan Ariely",
    "difficulty": "ADVANCED",
    "estimatedMins": 13,
    "contentEn": "This topic covers The Psychology of Pricing — How Buyers Decide Value — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Predictably Irrational by Dan Ariely: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Decoy effect: 3 options makes the middle choice seem best value\n- Lead with per-unit (Rs 3) not total price (Rs 15,000)\n- Charm pricing: Rs 14,999 feels significantly different from Rs 15,000\n- Investment framing: call it a brand investment not a cost\n- Compare to competitor pricing to anchor your rate as fair\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक मूल्य निर्धारण का मनोविज्ञान को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nPredictably Irrational by Dan Ariely से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Decoy effect: 3 options makes the middle choice seem best value\n- Lead with per-unit (Rs 3) not total price (Rs 15,000)\n- Charm pricing: Rs 14,999 feels significantly different from Rs 15,000\n- Investment framing: call it a brand investment not a cost\n- Compare to competitor pricing to anchor your rate as fair\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Psychology of Pricing in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Decoy effect: 3 options makes the middle choice seem best value\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में मूल्य निर्धारण का मनोविज्ञान लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Decoy effect: 3 options makes the middle choice seem best value",
    "keyPoints": [
      "Decoy effect: 3 options makes the middle choice seem best value",
      "Lead with per-unit (Rs 3) not total price (Rs 15,000)",
      "Charm pricing: Rs 14,999 feels significantly different from Rs 15,000",
      "Investment framing: call it a brand investment not a cost",
      "Compare to competitor pricing to anchor your rate as fair"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Psychology of Pricing'?",
        "questionHi": "'मूल्य निर्धारण का मनोविज्ञान' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Decoy effect: 3 options makes the middle choice seem best value",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Decoy effect: 3 options makes the middle choice seem best value",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Decoy effect: 3 options makes the middle choice seem best value",
        "explanationHi": "मुख्य सिद्धांत: Decoy effect: 3 options makes the middle choice seem best value"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Psychology of Pricing' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'मूल्य निर्धारण का मनोविज्ञान' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Psychology of Pricing'?",
        "questionHi": "'मूल्य निर्धारण का मनोविज्ञान' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Predictably Irrational by Dan Ariely",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Predictably Irrational by Dan Ariely",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Predictably Irrational by Dan Ariely",
        "explanationHi": "स्रोत: Predictably Irrational by Dan Ariely"
      },
      {
        "questionEn": "Key point 2 of 'The Psychology of Pricing — How Buyers Decide Value':",
        "questionHi": "'मूल्य निर्धारण का मनोविज्ञान' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Lead with per-unit (Rs 3) not total price (Rs 15,000)",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Lead with per-unit (Rs 3) not total price (Rs 15,000)",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Lead with per-unit (Rs 3) not total price (Rs 15,000)",
        "explanationHi": "मुख्य बिंदु 2: Lead with per-unit (Rs 3) not total price (Rs 15,000)"
      },
      {
        "questionEn": "The final key takeaway from 'The Psychology of Pricing — How Buyers Decide Value' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'मूल्य निर्धारण का मनोविज्ञान' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Compare to competitor pricing to anchor your rate as fair",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Compare to competitor pricing to anchor your rate as fair",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Compare to competitor pricing to anchor your rate as fair",
        "explanationHi": "अंतिम सीख: Compare to competitor pricing to anchor your rate as fair"
      }
    ]
  },
  {
    "orderIndex": 30,
    "groupNumber": 6,
    "titleEn": "Consultative Selling — Be the Trusted Advisor",
    "titleHi": "परामर्शदात्री बिक्री",
    "sourceBook": "The Trusted Advisor by David Maister",
    "difficulty": "ADVANCED",
    "estimatedMins": 13,
    "contentEn": "This topic covers Consultative Selling — Be the Trusted Advisor — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Trusted Advisor by David Maister: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Consultative selling means advisor relationship not vendor transaction\n- Trust equation: credibility plus reliability plus intimacy\n- Diagnose first: patient count, medicine type, current packaging\n- Recommend specific size based on their actual diagnosed need\n- Advisors create lifetime customers while vendors create one-time transactions\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक परामर्शदात्री बिक्री को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Trusted Advisor by David Maister से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Consultative selling means advisor relationship not vendor transaction\n- Trust equation: credibility plus reliability plus intimacy\n- Diagnose first: patient count, medicine type, current packaging\n- Recommend specific size based on their actual diagnosed need\n- Advisors create lifetime customers while vendors create one-time transactions\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Consultative Selling in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Consultative selling means advisor relationship not vendor transaction\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में परामर्शदात्री बिक्री लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Consultative selling means advisor relationship not vendor transaction",
    "keyPoints": [
      "Consultative selling means advisor relationship not vendor transaction",
      "Trust equation: credibility plus reliability plus intimacy",
      "Diagnose first: patient count, medicine type, current packaging",
      "Recommend specific size based on their actual diagnosed need",
      "Advisors create lifetime customers while vendors create one-time transactions"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Consultative Selling'?",
        "questionHi": "'परामर्शदात्री बिक्री' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Consultative selling means advisor relationship not vendor transaction",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Consultative selling means advisor relationship not vendor transaction",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Consultative selling means advisor relationship not vendor transaction",
        "explanationHi": "मुख्य सिद्धांत: Consultative selling means advisor relationship not vendor transaction"
      },
      {
        "questionEn": "In medicine pouch sales, 'Consultative Selling' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'परामर्शदात्री बिक्री' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Consultative Selling'?",
        "questionHi": "'परामर्शदात्री बिक्री' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Trusted Advisor by David Maister",
        "explanationHi": "स्रोत: The Trusted Advisor by David Maister"
      },
      {
        "questionEn": "Key point 2 of 'Consultative Selling — Be the Trusted Advisor':",
        "questionHi": "'परामर्शदात्री बिक्री' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Trust equation: credibility plus reliability plus intimacy",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Trust equation: credibility plus reliability plus intimacy",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Trust equation: credibility plus reliability plus intimacy",
        "explanationHi": "मुख्य बिंदु 2: Trust equation: credibility plus reliability plus intimacy"
      },
      {
        "questionEn": "The final key takeaway from 'Consultative Selling — Be the Trusted Advisor' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'परामर्शदात्री बिक्री' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Advisors create lifetime customers while vendors create one-time transactions",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Advisors create lifetime customers while vendors create one-time transactions",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Advisors create lifetime customers while vendors create one-time transactions",
        "explanationHi": "अंतिम सीख: Advisors create lifetime customers while vendors create one-time transactions"
      }
    ]
  },
  {
    "orderIndex": 31,
    "groupNumber": 7,
    "titleEn": "Territory Management — Owning Your Market Area",
    "titleHi": "क्षेत्र प्रबंधन",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "ADVANCED",
    "estimatedMins": 12,
    "contentEn": "This topic covers Territory Management — Owning Your Market Area — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Map your territory: every medical store within 50km radius\n- Work area by area to build local density and social proof\n- Local density: 5 stores in same market amplifies word of mouth\n- Document every store: owner name, last contact, status, next follow-up\n- Review your territory map every Monday to plan the week\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक क्षेत्र प्रबंधन को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Map your territory: every medical store within 50km radius\n- Work area by area to build local density and social proof\n- Local density: 5 stores in same market amplifies word of mouth\n- Document every store: owner name, last contact, status, next follow-up\n- Review your territory map every Monday to plan the week\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Territory Management in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Map your territory: every medical store within 50km radius\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में क्षेत्र प्रबंधन लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Map your territory: every medical store within 50km radius",
    "keyPoints": [
      "Map your territory: every medical store within 50km radius",
      "Work area by area to build local density and social proof",
      "Local density: 5 stores in same market amplifies word of mouth",
      "Document every store: owner name, last contact, status, next follow-up",
      "Review your territory map every Monday to plan the week"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Territory Management'?",
        "questionHi": "'क्षेत्र प्रबंधन' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Map your territory: every medical store within 50km radius",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Map your territory: every medical store within 50km radius",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Map your territory: every medical store within 50km radius",
        "explanationHi": "मुख्य सिद्धांत: Map your territory: every medical store within 50km radius"
      },
      {
        "questionEn": "In medicine pouch sales, 'Territory Management' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'क्षेत्र प्रबंधन' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Territory Management'?",
        "questionHi": "'क्षेत्र प्रबंधन' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'Territory Management — Owning Your Market Area':",
        "questionHi": "'क्षेत्र प्रबंधन' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Work area by area to build local density and social proof",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Work area by area to build local density and social proof",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Work area by area to build local density and social proof",
        "explanationHi": "मुख्य बिंदु 2: Work area by area to build local density and social proof"
      },
      {
        "questionEn": "The final key takeaway from 'Territory Management — Owning Your Market Area' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'क्षेत्र प्रबंधन' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Review your territory map every Monday to plan the week",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Review your territory map every Monday to plan the week",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Review your territory map every Monday to plan the week",
        "explanationHi": "अंतिम सीख: Review your territory map every Monday to plan the week"
      }
    ]
  },
  {
    "orderIndex": 32,
    "groupNumber": 7,
    "titleEn": "Seasonal Selling — Festival and Peak Season Strategy",
    "titleHi": "मौसमी बिक्री",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "ADVANCED",
    "estimatedMins": 11,
    "contentEn": "This topic covers Seasonal Selling — Festival and Peak Season Strategy — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Sales Bible by Jeffrey Gitomer: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Festival season (Diwali, Navratri) = highest medicine packaging demand\n- Pre-festival pitch: 'Get your branded batch before the rush'\n- Summer months: higher medicine consumption = faster pouch depletion\n- Reorder timing: contact 30 days before expected stock exhaustion\n- Build a festival calendar and reach out 6 weeks before each\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक मौसमी बिक्री को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Sales Bible by Jeffrey Gitomer से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Festival season (Diwali, Navratri) = highest medicine packaging demand\n- Pre-festival pitch: 'Get your branded batch before the rush'\n- Summer months: higher medicine consumption = faster pouch depletion\n- Reorder timing: contact 30 days before expected stock exhaustion\n- Build a festival calendar and reach out 6 weeks before each\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Seasonal Selling in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Festival season (Diwali, Navratri) = highest medicine packaging demand\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में मौसमी बिक्री लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Festival season (Diwali, Navratri) = highest medicine packaging demand",
    "keyPoints": [
      "Festival season (Diwali, Navratri) = highest medicine packaging demand",
      "Pre-festival pitch: 'Get your branded batch before the rush'",
      "Summer months: higher medicine consumption = faster pouch depletion",
      "Reorder timing: contact 30 days before expected stock exhaustion",
      "Build a festival calendar and reach out 6 weeks before each"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Seasonal Selling'?",
        "questionHi": "'मौसमी बिक्री' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Festival season (Diwali, Navratri) = highest medicine packaging demand",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Festival season (Diwali, Navratri) = highest medicine packaging demand",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Festival season (Diwali, Navratri) = highest medicine packaging demand",
        "explanationHi": "मुख्य सिद्धांत: Festival season (Diwali, Navratri) = highest medicine packaging demand"
      },
      {
        "questionEn": "In medicine pouch sales, 'Seasonal Selling' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'मौसमी बिक्री' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Seasonal Selling'?",
        "questionHi": "'मौसमी बिक्री' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Sales Bible by Jeffrey Gitomer",
        "explanationHi": "स्रोत: The Sales Bible by Jeffrey Gitomer"
      },
      {
        "questionEn": "Key point 2 of 'Seasonal Selling — Festival and Peak Season Strategy':",
        "questionHi": "'मौसमी बिक्री' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Pre-festival pitch: 'Get your branded batch before the rush'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Pre-festival pitch: 'Get your branded batch before the rush'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Pre-festival pitch: 'Get your branded batch before the rush'",
        "explanationHi": "मुख्य बिंदु 2: Pre-festival pitch: 'Get your branded batch before the rush'"
      },
      {
        "questionEn": "The final key takeaway from 'Seasonal Selling — Festival and Peak Season Strategy' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'मौसमी बिक्री' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Build a festival calendar and reach out 6 weeks before each",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Build a festival calendar and reach out 6 weeks before each",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Build a festival calendar and reach out 6 weeks before each",
        "explanationHi": "अंतिम सीख: Build a festival calendar and reach out 6 weeks before each"
      }
    ]
  },
  {
    "orderIndex": 33,
    "groupNumber": 7,
    "titleEn": "Handling the Aggressive Objector",
    "titleHi": "आक्रामक आपत्तिकर्ता को संभालना",
    "sourceBook": "Never Split the Difference by Chris Voss",
    "difficulty": "ADVANCED",
    "estimatedMins": 10,
    "contentEn": "This topic covers Handling the Aggressive Objector — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Never Split the Difference by Chris Voss: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Aggressive objection usually means they are actually interested\n- Never match their aggression — lower your voice when they raise theirs\n- The label technique: 'It seems like you have had a bad experience with vendors'\n- Silence after an aggressive statement often makes them soften\n- Empathy first: 'You are right to be skeptical — let me earn your trust'\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक आक्रामक आपत्तिकर्ता को संभालना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nNever Split the Difference by Chris Voss से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Aggressive objection usually means they are actually interested\n- Never match their aggression — lower your voice when they raise theirs\n- The label technique: 'It seems like you have had a bad experience with vendors'\n- Silence after an aggressive statement often makes them soften\n- Empathy first: 'You are right to be skeptical — let me earn your trust'\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Handling the Aggressive Objector in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Aggressive objection usually means they are actually interested\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में आक्रामक आपत्तिकर्ता को संभालना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Aggressive objection usually means they are actually interested",
    "keyPoints": [
      "Aggressive objection usually means they are actually interested",
      "Never match their aggression — lower your voice when they raise theirs",
      "The label technique: 'It seems like you have had a bad experience with vendors'",
      "Silence after an aggressive statement often makes them soften",
      "Empathy first: 'You are right to be skeptical — let me earn your trust'"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Handling the Aggressive Objector'?",
        "questionHi": "'आक्रामक आपत्तिकर्ता को संभालना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Aggressive objection usually means they are actually interested",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Aggressive objection usually means they are actually interested",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Aggressive objection usually means they are actually interested",
        "explanationHi": "मुख्य सिद्धांत: Aggressive objection usually means they are actually interested"
      },
      {
        "questionEn": "In medicine pouch sales, 'Handling the Aggressive Objector' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आक्रामक आपत्तिकर्ता को संभालना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Handling the Aggressive Objector'?",
        "questionHi": "'आक्रामक आपत्तिकर्ता को संभालना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Never Split the Difference by Chris Voss",
        "explanationHi": "स्रोत: Never Split the Difference by Chris Voss"
      },
      {
        "questionEn": "Key point 2 of 'Handling the Aggressive Objector':",
        "questionHi": "'आक्रामक आपत्तिकर्ता को संभालना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Never match their aggression — lower your voice when they raise theirs",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Never match their aggression — lower your voice when they raise theirs",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Never match their aggression — lower your voice when they raise theirs",
        "explanationHi": "मुख्य बिंदु 2: Never match their aggression — lower your voice when they raise theirs"
      },
      {
        "questionEn": "The final key takeaway from 'Handling the Aggressive Objector' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'आक्रामक आपत्तिकर्ता को संभालना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Empathy first: 'You are right to be skeptical — let me earn your trust'",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Empathy first: 'You are right to be skeptical — let me earn your trust'",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Empathy first: 'You are right to be skeptical — let me earn your trust'",
        "explanationHi": "अंतिम सीख: Empathy first: 'You are right to be skeptical — let me earn your trust'"
      }
    ]
  },
  {
    "orderIndex": 34,
    "groupNumber": 7,
    "titleEn": "WhatsApp Broadcast Campaigns for Medicine Pouches",
    "titleHi": "WhatsApp ब्रॉडकास्ट अभियान",
    "sourceBook": "Sell or Be Sold by Grant Cardone",
    "difficulty": "ADVANCED",
    "estimatedMins": 11,
    "contentEn": "This topic covers WhatsApp Broadcast Campaigns for Medicine Pouches — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Sell or Be Sold by Grant Cardone: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Build a broadcast list of all chemist contacts who have opted in\n- Send seasonal offers as a broadcast not individual messages\n- Broadcast content: before festival season, new design showcases\n- Never spam: maximum 2 broadcast messages per month\n- Follow up individually after every broadcast for best conversion\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक WhatsApp ब्रॉडकास्ट अभियान को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nSell or Be Sold by Grant Cardone से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Build a broadcast list of all chemist contacts who have opted in\n- Send seasonal offers as a broadcast not individual messages\n- Broadcast content: before festival season, new design showcases\n- Never spam: maximum 2 broadcast messages per month\n- Follow up individually after every broadcast for best conversion\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying WhatsApp Broadcast Campaigns for Medicine Pouches in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Build a broadcast list of all chemist contacts who have opted in\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में WhatsApp ब्रॉडकास्ट अभियान लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Build a broadcast list of all chemist contacts who have opted in",
    "keyPoints": [
      "Build a broadcast list of all chemist contacts who have opted in",
      "Send seasonal offers as a broadcast not individual messages",
      "Broadcast content: before festival season, new design showcases",
      "Never spam: maximum 2 broadcast messages per month",
      "Follow up individually after every broadcast for best conversion"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'WhatsApp Broadcast Campaigns for Medicine Pouches'?",
        "questionHi": "'WhatsApp ब्रॉडकास्ट अभियान' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Build a broadcast list of all chemist contacts who have opted in",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Build a broadcast list of all chemist contacts who have opted in",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Build a broadcast list of all chemist contacts who have opted in",
        "explanationHi": "मुख्य सिद्धांत: Build a broadcast list of all chemist contacts who have opted in"
      },
      {
        "questionEn": "In medicine pouch sales, 'WhatsApp Broadcast Campaigns for Medicine Pouches' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'WhatsApp ब्रॉडकास्ट अभियान' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'WhatsApp Broadcast Campaigns for Medicine Pouches'?",
        "questionHi": "'WhatsApp ब्रॉडकास्ट अभियान' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Sell or Be Sold by Grant Cardone",
        "explanationHi": "स्रोत: Sell or Be Sold by Grant Cardone"
      },
      {
        "questionEn": "Key point 2 of 'WhatsApp Broadcast Campaigns for Medicine Pouches':",
        "questionHi": "'WhatsApp ब्रॉडकास्ट अभियान' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Send seasonal offers as a broadcast not individual messages",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Send seasonal offers as a broadcast not individual messages",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Send seasonal offers as a broadcast not individual messages",
        "explanationHi": "मुख्य बिंदु 2: Send seasonal offers as a broadcast not individual messages"
      },
      {
        "questionEn": "The final key takeaway from 'WhatsApp Broadcast Campaigns for Medicine Pouches' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'WhatsApp ब्रॉडकास्ट अभियान' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Follow up individually after every broadcast for best conversion",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Follow up individually after every broadcast for best conversion",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Follow up individually after every broadcast for best conversion",
        "explanationHi": "अंतिम सीख: Follow up individually after every broadcast for best conversion"
      }
    ]
  },
  {
    "orderIndex": 35,
    "groupNumber": 7,
    "titleEn": "Chain Pharmacy Approach — Selling to Multiple Locations",
    "titleHi": "चेन फार्मेसी दृष्टिकोण",
    "sourceBook": "The Challenger Sale",
    "difficulty": "ADVANCED",
    "estimatedMins": 14,
    "contentEn": "This topic covers Chain Pharmacy Approach — Selling to Multiple Locations — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Chain pharmacy decision is made at HQ level not store level\n- Research chain HQ: who manages procurement and branding?\n- Benefit of chains: one yes equals 20 to 50 store orders\n- Pitch to chains: consistent branding across all locations\n- Ask store managers to introduce you upward to the chain buyer\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक चेन फार्मेसी दृष्टिकोण को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Chain pharmacy decision is made at HQ level not store level\n- Research chain HQ: who manages procurement and branding?\n- Benefit of chains: one yes equals 20 to 50 store orders\n- Pitch to chains: consistent branding across all locations\n- Ask store managers to introduce you upward to the chain buyer\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Chain Pharmacy Approach in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Chain pharmacy decision is made at HQ level not store level\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में चेन फार्मेसी दृष्टिकोण लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Chain pharmacy decision is made at HQ level not store level",
    "keyPoints": [
      "Chain pharmacy decision is made at HQ level not store level",
      "Research chain HQ: who manages procurement and branding?",
      "Benefit of chains: one yes equals 20 to 50 store orders",
      "Pitch to chains: consistent branding across all locations",
      "Ask store managers to introduce you upward to the chain buyer"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Chain Pharmacy Approach'?",
        "questionHi": "'चेन फार्मेसी दृष्टिकोण' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Chain pharmacy decision is made at HQ level not store level",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Chain pharmacy decision is made at HQ level not store level",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Chain pharmacy decision is made at HQ level not store level",
        "explanationHi": "मुख्य सिद्धांत: Chain pharmacy decision is made at HQ level not store level"
      },
      {
        "questionEn": "In medicine pouch sales, 'Chain Pharmacy Approach' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'चेन फार्मेसी दृष्टिकोण' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Chain Pharmacy Approach'?",
        "questionHi": "'चेन फार्मेसी दृष्टिकोण' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'Chain Pharmacy Approach — Selling to Multiple Locations':",
        "questionHi": "'चेन फार्मेसी दृष्टिकोण' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Research chain HQ: who manages procurement and branding?",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Research chain HQ: who manages procurement and branding?",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Research chain HQ: who manages procurement and branding?",
        "explanationHi": "मुख्य बिंदु 2: Research chain HQ: who manages procurement and branding?"
      },
      {
        "questionEn": "The final key takeaway from 'Chain Pharmacy Approach — Selling to Multiple Locations' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'चेन फार्मेसी दृष्टिकोण' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Ask store managers to introduce you upward to the chain buyer",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Ask store managers to introduce you upward to the chain buyer",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Ask store managers to introduce you upward to the chain buyer",
        "explanationHi": "अंतिम सीख: Ask store managers to introduce you upward to the chain buyer"
      }
    ]
  },
  {
    "orderIndex": 36,
    "groupNumber": 7,
    "titleEn": "Distributor Channel — Selling Through Intermediaries",
    "titleHi": "वितरक चैनल",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "ADVANCED",
    "estimatedMins": 13,
    "contentEn": "This topic covers Distributor Channel — Selling Through Intermediaries — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Distributors serve hundreds of medical stores — one relationship scales fast\n- Pitch to distributor: add branded pouches to their catalog\n- Distributor margin: offer 15 to 20 percent margin on pouch sales\n- Training distributors: they need to know the pitch to sell to stores\n- Monthly distributor review: track which stores they have introduced you to\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक वितरक चैनल को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Distributors serve hundreds of medical stores — one relationship scales fast\n- Pitch to distributor: add branded pouches to their catalog\n- Distributor margin: offer 15 to 20 percent margin on pouch sales\n- Training distributors: they need to know the pitch to sell to stores\n- Monthly distributor review: track which stores they have introduced you to\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Distributor Channel in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Distributors serve hundreds of medical stores — one relationship scales fast\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में वितरक चैनल लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Distributors serve hundreds of medical stores — one relationship scales fast",
    "keyPoints": [
      "Distributors serve hundreds of medical stores — one relationship scales fast",
      "Pitch to distributor: add branded pouches to their catalog",
      "Distributor margin: offer 15 to 20 percent margin on pouch sales",
      "Training distributors: they need to know the pitch to sell to stores",
      "Monthly distributor review: track which stores they have introduced you to"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Distributor Channel'?",
        "questionHi": "'वितरक चैनल' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Distributors serve hundreds of medical stores — one relationship scales fast",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Distributors serve hundreds of medical stores — one relationship scales fast",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Distributors serve hundreds of medical stores — one relationship scales fast",
        "explanationHi": "मुख्य सिद्धांत: Distributors serve hundreds of medical stores — one relationship scales fast"
      },
      {
        "questionEn": "In medicine pouch sales, 'Distributor Channel' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'वितरक चैनल' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Distributor Channel'?",
        "questionHi": "'वितरक चैनल' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'Distributor Channel — Selling Through Intermediaries':",
        "questionHi": "'वितरक चैनल' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Pitch to distributor: add branded pouches to their catalog",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Pitch to distributor: add branded pouches to their catalog",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Pitch to distributor: add branded pouches to their catalog",
        "explanationHi": "मुख्य बिंदु 2: Pitch to distributor: add branded pouches to their catalog"
      },
      {
        "questionEn": "The final key takeaway from 'Distributor Channel — Selling Through Intermediaries' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'वितरक चैनल' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Monthly distributor review: track which stores they have introduced you to",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Monthly distributor review: track which stores they have introduced you to",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Monthly distributor review: track which stores they have introduced you to",
        "explanationHi": "अंतिम सीख: Monthly distributor review: track which stores they have introduced you to"
      }
    ]
  },
  {
    "orderIndex": 37,
    "groupNumber": 7,
    "titleEn": "Upselling and Cross-Selling to Existing Customers",
    "titleHi": "अपसेलिंग और क्रॉस-सेलिंग",
    "sourceBook": "To Sell is Human by Daniel Pink",
    "difficulty": "ADVANCED",
    "estimatedMins": 10,
    "contentEn": "This topic covers Upselling and Cross-Selling to Existing Customers — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from To Sell is Human by Daniel Pink: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Upsell: at reorder time, suggest moving from 5000 to 10,000 pieces\n- Cross-sell: if they use 4x5, introduce them to 4x7 for larger prescriptions\n- Timing: suggest upsell when they are happiest — at delivery or reorder\n- Loyalty reward: give 500 free pieces at their second reorder\n- The best customer for a new sale is an existing satisfied customer\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक अपसेलिंग और क्रॉस-सेलिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nTo Sell is Human by Daniel Pink से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Upsell: at reorder time, suggest moving from 5000 to 10,000 pieces\n- Cross-sell: if they use 4x5, introduce them to 4x7 for larger prescriptions\n- Timing: suggest upsell when they are happiest — at delivery or reorder\n- Loyalty reward: give 500 free pieces at their second reorder\n- The best customer for a new sale is an existing satisfied customer\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Upselling and Cross-Selling to Existing Customers in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Upsell: at reorder time, suggest moving from 5000 to 10,000 pieces\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में अपसेलिंग और क्रॉस-सेलिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Upsell: at reorder time, suggest moving from 5000 to 10,000 pieces",
    "keyPoints": [
      "Upsell: at reorder time, suggest moving from 5000 to 10,000 pieces",
      "Cross-sell: if they use 4x5, introduce them to 4x7 for larger prescriptions",
      "Timing: suggest upsell when they are happiest — at delivery or reorder",
      "Loyalty reward: give 500 free pieces at their second reorder",
      "The best customer for a new sale is an existing satisfied customer"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Upselling and Cross-Selling to Existing Customers'?",
        "questionHi": "'अपसेलिंग और क्रॉस-सेलिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Upsell: at reorder time, suggest moving from 5000 to 10,000 pieces",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Upsell: at reorder time, suggest moving from 5000 to 10,000 pieces",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Upsell: at reorder time, suggest moving from 5000 to 10,000 pieces",
        "explanationHi": "मुख्य सिद्धांत: Upsell: at reorder time, suggest moving from 5000 to 10,000 pieces"
      },
      {
        "questionEn": "In medicine pouch sales, 'Upselling and Cross-Selling to Existing Customers' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'अपसेलिंग और क्रॉस-सेलिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Upselling and Cross-Selling to Existing Customers'?",
        "questionHi": "'अपसेलिंग और क्रॉस-सेलिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "To Sell is Human by Daniel Pink",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "To Sell is Human by Daniel Pink",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: To Sell is Human by Daniel Pink",
        "explanationHi": "स्रोत: To Sell is Human by Daniel Pink"
      },
      {
        "questionEn": "Key point 2 of 'Upselling and Cross-Selling to Existing Customers':",
        "questionHi": "'अपसेलिंग और क्रॉस-सेलिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Cross-sell: if they use 4x5, introduce them to 4x7 for larger prescriptions",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Cross-sell: if they use 4x5, introduce them to 4x7 for larger prescriptions",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Cross-sell: if they use 4x5, introduce them to 4x7 for larger prescriptions",
        "explanationHi": "मुख्य बिंदु 2: Cross-sell: if they use 4x5, introduce them to 4x7 for larger prescriptions"
      },
      {
        "questionEn": "The final key takeaway from 'Upselling and Cross-Selling to Existing Customers' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'अपसेलिंग और क्रॉस-सेलिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "The best customer for a new sale is an existing satisfied customer",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "The best customer for a new sale is an existing satisfied customer",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: The best customer for a new sale is an existing satisfied customer",
        "explanationHi": "अंतिम सीख: The best customer for a new sale is an existing satisfied customer"
      }
    ]
  },
  {
    "orderIndex": 38,
    "groupNumber": 7,
    "titleEn": "COD Objection — Handling Payment Hesitation",
    "titleHi": "COD आपत्ति",
    "sourceBook": "Sell or Be Sold by Grant Cardone",
    "difficulty": "ADVANCED",
    "estimatedMins": 9,
    "contentEn": "This topic covers COD Objection — Handling Payment Hesitation — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Sell or Be Sold by Grant Cardone: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- 50 percent COD means half payment on order placement — standard industry terms\n- Address COD objection: 'You only pay 50 percent now — balance on delivery'\n- Trust builder: explain no charge until they see and approve the design proof\n- First order guarantee: 'If quality is not as promised, we replace at zero cost'\n- Invoice and GST documentation removes remaining financial hesitation\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक COD आपत्ति को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nSell or Be Sold by Grant Cardone से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- 50 percent COD means half payment on order placement — standard industry terms\n- Address COD objection: 'You only pay 50 percent now — balance on delivery'\n- Trust builder: explain no charge until they see and approve the design proof\n- First order guarantee: 'If quality is not as promised, we replace at zero cost'\n- Invoice and GST documentation removes remaining financial hesitation\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying COD Objection in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: 50 percent COD means half payment on order placement — standard industry terms\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में COD आपत्ति लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: 50 percent COD means half payment on order placement — standard industry terms",
    "keyPoints": [
      "50 percent COD means half payment on order placement — standard industry terms",
      "Address COD objection: 'You only pay 50 percent now — balance on delivery'",
      "Trust builder: explain no charge until they see and approve the design proof",
      "First order guarantee: 'If quality is not as promised, we replace at zero cost'",
      "Invoice and GST documentation removes remaining financial hesitation"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'COD Objection'?",
        "questionHi": "'COD आपत्ति' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "50 percent COD means half payment on order placement — standard industry terms",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "50 percent COD means half payment on order placement — standard industry terms",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: 50 percent COD means half payment on order placement — standard industry terms",
        "explanationHi": "मुख्य सिद्धांत: 50 percent COD means half payment on order placement — standard industry terms"
      },
      {
        "questionEn": "In medicine pouch sales, 'COD Objection' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'COD आपत्ति' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'COD Objection'?",
        "questionHi": "'COD आपत्ति' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Sell or Be Sold by Grant Cardone",
        "explanationHi": "स्रोत: Sell or Be Sold by Grant Cardone"
      },
      {
        "questionEn": "Key point 2 of 'COD Objection — Handling Payment Hesitation':",
        "questionHi": "'COD आपत्ति' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Address COD objection: 'You only pay 50 percent now — balance on delivery'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Address COD objection: 'You only pay 50 percent now — balance on delivery'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Address COD objection: 'You only pay 50 percent now — balance on delivery'",
        "explanationHi": "मुख्य बिंदु 2: Address COD objection: 'You only pay 50 percent now — balance on delivery'"
      },
      {
        "questionEn": "The final key takeaway from 'COD Objection — Handling Payment Hesitation' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'COD आपत्ति' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Invoice and GST documentation removes remaining financial hesitation",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Invoice and GST documentation removes remaining financial hesitation",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Invoice and GST documentation removes remaining financial hesitation",
        "explanationHi": "अंतिम सीख: Invoice and GST documentation removes remaining financial hesitation"
      }
    ]
  },
  {
    "orderIndex": 39,
    "groupNumber": 7,
    "titleEn": "Managing Delivery Delay Concerns",
    "titleHi": "डिलीवरी देरी की चिंताओं को संभालना",
    "sourceBook": "The Trusted Advisor by David Maister",
    "difficulty": "ADVANCED",
    "estimatedMins": 9,
    "contentEn": "This topic covers Managing Delivery Delay Concerns — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Trusted Advisor by David Maister: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- 15 working day delivery is standard — communicate this upfront proactively\n- For festival orders: recommend ordering 30 days before the date needed\n- Production tracking: update customer at design approval and production start\n- If delay occurs: proactive communication beats reactive apology always\n- Building delivery credibility over time converts skeptics to loyal reorders\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक डिलीवरी देरी की चिंताओं को संभालना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Trusted Advisor by David Maister से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- 15 working day delivery is standard — communicate this upfront proactively\n- For festival orders: recommend ordering 30 days before the date needed\n- Production tracking: update customer at design approval and production start\n- If delay occurs: proactive communication beats reactive apology always\n- Building delivery credibility over time converts skeptics to loyal reorders\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Managing Delivery Delay Concerns in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: 15 working day delivery is standard — communicate this upfront proactively\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में डिलीवरी देरी की चिंताओं को संभालना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: 15 working day delivery is standard — communicate this upfront proactively",
    "keyPoints": [
      "15 working day delivery is standard — communicate this upfront proactively",
      "For festival orders: recommend ordering 30 days before the date needed",
      "Production tracking: update customer at design approval and production start",
      "If delay occurs: proactive communication beats reactive apology always",
      "Building delivery credibility over time converts skeptics to loyal reorders"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Managing Delivery Delay Concerns'?",
        "questionHi": "'डिलीवरी देरी की चिंताओं को संभालना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "15 working day delivery is standard — communicate this upfront proactively",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "15 working day delivery is standard — communicate this upfront proactively",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: 15 working day delivery is standard — communicate this upfront proactively",
        "explanationHi": "मुख्य सिद्धांत: 15 working day delivery is standard — communicate this upfront proactively"
      },
      {
        "questionEn": "In medicine pouch sales, 'Managing Delivery Delay Concerns' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'डिलीवरी देरी की चिंताओं को संभालना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Managing Delivery Delay Concerns'?",
        "questionHi": "'डिलीवरी देरी की चिंताओं को संभालना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Trusted Advisor by David Maister",
        "explanationHi": "स्रोत: The Trusted Advisor by David Maister"
      },
      {
        "questionEn": "Key point 2 of 'Managing Delivery Delay Concerns':",
        "questionHi": "'डिलीवरी देरी की चिंताओं को संभालना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "For festival orders: recommend ordering 30 days before the date needed",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "For festival orders: recommend ordering 30 days before the date needed",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: For festival orders: recommend ordering 30 days before the date needed",
        "explanationHi": "मुख्य बिंदु 2: For festival orders: recommend ordering 30 days before the date needed"
      },
      {
        "questionEn": "The final key takeaway from 'Managing Delivery Delay Concerns' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'डिलीवरी देरी की चिंताओं को संभालना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Building delivery credibility over time converts skeptics to loyal reorders",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Building delivery credibility over time converts skeptics to loyal reorders",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Building delivery credibility over time converts skeptics to loyal reorders",
        "explanationHi": "अंतिम सीख: Building delivery credibility over time converts skeptics to loyal reorders"
      }
    ]
  },
  {
    "orderIndex": 40,
    "groupNumber": 7,
    "titleEn": "Multilingual Pitching — Hindi, Marathi, Gujarati",
    "titleHi": "बहुभाषी पिचिंग",
    "sourceBook": "Psychology of Selling by Brian Tracy",
    "difficulty": "ADVANCED",
    "estimatedMins": 11,
    "contentEn": "This topic covers Multilingual Pitching — Hindi, Marathi, Gujarati — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Psychology of Selling by Brian Tracy: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Speaking in their language creates instant 3x rapport advantage\n- Marathi for Maharashtra: use 'apli dukaan' not just 'your store'\n- Gujarati for Gujarat: use 'tamari dukan' and regional business references\n- Hindi for UP/MP/Rajasthan: formal 'aap' with older owners\n- Match language to location — never assume English is preferred\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक बहुभाषी पिचिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nPsychology of Selling by Brian Tracy से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Speaking in their language creates instant 3x rapport advantage\n- Marathi for Maharashtra: use 'apli dukaan' not just 'your store'\n- Gujarati for Gujarat: use 'tamari dukan' and regional business references\n- Hindi for UP/MP/Rajasthan: formal 'aap' with older owners\n- Match language to location — never assume English is preferred\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Multilingual Pitching in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Speaking in their language creates instant 3x rapport advantage\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में बहुभाषी पिचिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Speaking in their language creates instant 3x rapport advantage",
    "keyPoints": [
      "Speaking in their language creates instant 3x rapport advantage",
      "Marathi for Maharashtra: use 'apli dukaan' not just 'your store'",
      "Gujarati for Gujarat: use 'tamari dukan' and regional business references",
      "Hindi for UP/MP/Rajasthan: formal 'aap' with older owners",
      "Match language to location — never assume English is preferred"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Multilingual Pitching'?",
        "questionHi": "'बहुभाषी पिचिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Speaking in their language creates instant 3x rapport advantage",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Speaking in their language creates instant 3x rapport advantage",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Speaking in their language creates instant 3x rapport advantage",
        "explanationHi": "मुख्य सिद्धांत: Speaking in their language creates instant 3x rapport advantage"
      },
      {
        "questionEn": "In medicine pouch sales, 'Multilingual Pitching' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'बहुभाषी पिचिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Multilingual Pitching'?",
        "questionHi": "'बहुभाषी पिचिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Psychology of Selling by Brian Tracy",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Psychology of Selling by Brian Tracy",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Psychology of Selling by Brian Tracy",
        "explanationHi": "स्रोत: Psychology of Selling by Brian Tracy"
      },
      {
        "questionEn": "Key point 2 of 'Multilingual Pitching — Hindi, Marathi, Gujarati':",
        "questionHi": "'बहुभाषी पिचिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Marathi for Maharashtra: use 'apli dukaan' not just 'your store'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Marathi for Maharashtra: use 'apli dukaan' not just 'your store'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Marathi for Maharashtra: use 'apli dukaan' not just 'your store'",
        "explanationHi": "मुख्य बिंदु 2: Marathi for Maharashtra: use 'apli dukaan' not just 'your store'"
      },
      {
        "questionEn": "The final key takeaway from 'Multilingual Pitching — Hindi, Marathi, Gujarati' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'बहुभाषी पिचिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Match language to location — never assume English is preferred",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Match language to location — never assume English is preferred",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Match language to location — never assume English is preferred",
        "explanationHi": "अंतिम सीख: Match language to location — never assume English is preferred"
      }
    ]
  },
  {
    "orderIndex": 41,
    "groupNumber": 8,
    "titleEn": "Negotiation Mastery — When and How to Negotiate",
    "titleHi": "बातचीत में महारत",
    "sourceBook": "Never Split the Difference by Chris Voss",
    "difficulty": "ADVANCED",
    "estimatedMins": 14,
    "contentEn": "This topic covers Negotiation Mastery — When and How to Negotiate — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Never Split the Difference by Chris Voss: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Never negotiate until they explicitly ask for a discount\n- When they ask: do not say yes immediately — pause and appear to think\n- Conditional concession: 'If you do 10,000 pieces, I can do 10 percent better'\n- Never give without getting: discount requires a larger order or faster payment\n- Protect your floor price: know your minimum before the call starts\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक बातचीत में महारत को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nNever Split the Difference by Chris Voss से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Never negotiate until they explicitly ask for a discount\n- When they ask: do not say yes immediately — pause and appear to think\n- Conditional concession: 'If you do 10,000 pieces, I can do 10 percent better'\n- Never give without getting: discount requires a larger order or faster payment\n- Protect your floor price: know your minimum before the call starts\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Negotiation Mastery in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Never negotiate until they explicitly ask for a discount\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में बातचीत में महारत लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Never negotiate until they explicitly ask for a discount",
    "keyPoints": [
      "Never negotiate until they explicitly ask for a discount",
      "When they ask: do not say yes immediately — pause and appear to think",
      "Conditional concession: 'If you do 10,000 pieces, I can do 10 percent better'",
      "Never give without getting: discount requires a larger order or faster payment",
      "Protect your floor price: know your minimum before the call starts"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Negotiation Mastery'?",
        "questionHi": "'बातचीत में महारत' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Never negotiate until they explicitly ask for a discount",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Never negotiate until they explicitly ask for a discount",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Never negotiate until they explicitly ask for a discount",
        "explanationHi": "मुख्य सिद्धांत: Never negotiate until they explicitly ask for a discount"
      },
      {
        "questionEn": "In medicine pouch sales, 'Negotiation Mastery' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'बातचीत में महारत' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Negotiation Mastery'?",
        "questionHi": "'बातचीत में महारत' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Never Split the Difference by Chris Voss",
        "explanationHi": "स्रोत: Never Split the Difference by Chris Voss"
      },
      {
        "questionEn": "Key point 2 of 'Negotiation Mastery — When and How to Negotiate':",
        "questionHi": "'बातचीत में महारत' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "When they ask: do not say yes immediately — pause and appear to think",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "When they ask: do not say yes immediately — pause and appear to think",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: When they ask: do not say yes immediately — pause and appear to think",
        "explanationHi": "मुख्य बिंदु 2: When they ask: do not say yes immediately — pause and appear to think"
      },
      {
        "questionEn": "The final key takeaway from 'Negotiation Mastery — When and How to Negotiate' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'बातचीत में महारत' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Protect your floor price: know your minimum before the call starts",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Protect your floor price: know your minimum before the call starts",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Protect your floor price: know your minimum before the call starts",
        "explanationHi": "अंतिम सीख: Protect your floor price: know your minimum before the call starts"
      }
    ]
  },
  {
    "orderIndex": 42,
    "groupNumber": 8,
    "titleEn": "Account Mapping — Understanding the Buying Ecosystem",
    "titleHi": "अकाउंट मैपिंग",
    "sourceBook": "The Challenger Sale",
    "difficulty": "ADVANCED",
    "estimatedMins": 13,
    "contentEn": "This topic covers Account Mapping — Understanding the Buying Ecosystem — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Map: owner, decision maker, influencer, gatekeeper for each account\n- In larger stores: owner approves, manager executes, staff influences\n- Find the internal champion: who inside the store wants your product?\n- Account map for chain pharmacy: store manager to area manager to HQ buyer\n- Update your account map after every call with new information\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक अकाउंट मैपिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Map: owner, decision maker, influencer, gatekeeper for each account\n- In larger stores: owner approves, manager executes, staff influences\n- Find the internal champion: who inside the store wants your product?\n- Account map for chain pharmacy: store manager to area manager to HQ buyer\n- Update your account map after every call with new information\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Account Mapping in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Map: owner, decision maker, influencer, gatekeeper for each account\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में अकाउंट मैपिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Map: owner, decision maker, influencer, gatekeeper for each account",
    "keyPoints": [
      "Map: owner, decision maker, influencer, gatekeeper for each account",
      "In larger stores: owner approves, manager executes, staff influences",
      "Find the internal champion: who inside the store wants your product?",
      "Account map for chain pharmacy: store manager to area manager to HQ buyer",
      "Update your account map after every call with new information"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Account Mapping'?",
        "questionHi": "'अकाउंट मैपिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Map: owner, decision maker, influencer, gatekeeper for each account",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Map: owner, decision maker, influencer, gatekeeper for each account",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Map: owner, decision maker, influencer, gatekeeper for each account",
        "explanationHi": "मुख्य सिद्धांत: Map: owner, decision maker, influencer, gatekeeper for each account"
      },
      {
        "questionEn": "In medicine pouch sales, 'Account Mapping' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'अकाउंट मैपिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Account Mapping'?",
        "questionHi": "'अकाउंट मैपिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'Account Mapping — Understanding the Buying Ecosystem':",
        "questionHi": "'अकाउंट मैपिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "In larger stores: owner approves, manager executes, staff influences",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "In larger stores: owner approves, manager executes, staff influences",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: In larger stores: owner approves, manager executes, staff influences",
        "explanationHi": "मुख्य बिंदु 2: In larger stores: owner approves, manager executes, staff influences"
      },
      {
        "questionEn": "The final key takeaway from 'Account Mapping — Understanding the Buying Ecosystem' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'अकाउंट मैपिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Update your account map after every call with new information",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Update your account map after every call with new information",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Update your account map after every call with new information",
        "explanationHi": "अंतिम सीख: Update your account map after every call with new information"
      }
    ]
  },
  {
    "orderIndex": 43,
    "groupNumber": 8,
    "titleEn": "Competitive Intelligence — Knowing Your Competitors",
    "titleHi": "प्रतिस्पर्धी बुद्धिमत्ता",
    "sourceBook": "The Challenger Sale",
    "difficulty": "ADVANCED",
    "estimatedMins": 11,
    "contentEn": "This topic covers Competitive Intelligence — Knowing Your Competitors — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Know 3 main competitor pricing: local printer, bulk stationery, another vendor\n- Competitor weakness: local printers usually offer single color or poor GSM\n- Your advantage: multicolor, 70 GSM, GST invoice, design support, pan-India\n- Never trash competitors — compare features factually and let them decide\n- When chemist mentions a competitor: ask 'What do you like most about them?'\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक प्रतिस्पर्धी बुद्धिमत्ता को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Know 3 main competitor pricing: local printer, bulk stationery, another vendor\n- Competitor weakness: local printers usually offer single color or poor GSM\n- Your advantage: multicolor, 70 GSM, GST invoice, design support, pan-India\n- Never trash competitors — compare features factually and let them decide\n- When chemist mentions a competitor: ask 'What do you like most about them?'\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Competitive Intelligence in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Know 3 main competitor pricing: local printer, bulk stationery, another vendor\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में प्रतिस्पर्धी बुद्धिमत्ता लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Know 3 main competitor pricing: local printer, bulk stationery, another vendor",
    "keyPoints": [
      "Know 3 main competitor pricing: local printer, bulk stationery, another vendor",
      "Competitor weakness: local printers usually offer single color or poor GSM",
      "Your advantage: multicolor, 70 GSM, GST invoice, design support, pan-India",
      "Never trash competitors — compare features factually and let them decide",
      "When chemist mentions a competitor: ask 'What do you like most about them?'"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Competitive Intelligence'?",
        "questionHi": "'प्रतिस्पर्धी बुद्धिमत्ता' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Know 3 main competitor pricing: local printer, bulk stationery, another vendor",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Know 3 main competitor pricing: local printer, bulk stationery, another vendor",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Know 3 main competitor pricing: local printer, bulk stationery, another vendor",
        "explanationHi": "मुख्य सिद्धांत: Know 3 main competitor pricing: local printer, bulk stationery, another vendor"
      },
      {
        "questionEn": "In medicine pouch sales, 'Competitive Intelligence' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'प्रतिस्पर्धी बुद्धिमत्ता' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Competitive Intelligence'?",
        "questionHi": "'प्रतिस्पर्धी बुद्धिमत्ता' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'Competitive Intelligence — Knowing Your Competitors':",
        "questionHi": "'प्रतिस्पर्धी बुद्धिमत्ता' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Competitor weakness: local printers usually offer single color or poor GSM",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Competitor weakness: local printers usually offer single color or poor GSM",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Competitor weakness: local printers usually offer single color or poor GSM",
        "explanationHi": "मुख्य बिंदु 2: Competitor weakness: local printers usually offer single color or poor GSM"
      },
      {
        "questionEn": "The final key takeaway from 'Competitive Intelligence — Knowing Your Competitors' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'प्रतिस्पर्धी बुद्धिमत्ता' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "When chemist mentions a competitor: ask 'What do you like most about them?'",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "When chemist mentions a competitor: ask 'What do you like most about them?'",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: When chemist mentions a competitor: ask 'What do you like most about them?'",
        "explanationHi": "अंतिम सीख: When chemist mentions a competitor: ask 'What do you like most about them?'"
      }
    ]
  },
  {
    "orderIndex": 44,
    "groupNumber": 8,
    "titleEn": "Creating Urgency Without Pressure",
    "titleHi": "दबाव के बिना तात्कालिकता बनाना",
    "sourceBook": "Influence by Robert Cialdini",
    "difficulty": "ADVANCED",
    "estimatedMins": 10,
    "contentEn": "This topic covers Creating Urgency Without Pressure — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Influence by Robert Cialdini: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Urgency must be real — fake urgency destroys trust permanently\n- Real urgency triggers: festival season, limited batch slots, rate revision\n- 'We are starting a production run this week — want to join this batch?'\n- Social proof urgency: '3 stores in your market already confirmed this batch'\n- Scarcity without manipulation: be honest about actual capacity limits\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक दबाव के बिना तात्कालिकता बनाना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nInfluence by Robert Cialdini से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Urgency must be real — fake urgency destroys trust permanently\n- Real urgency triggers: festival season, limited batch slots, rate revision\n- 'We are starting a production run this week — want to join this batch?'\n- Social proof urgency: '3 stores in your market already confirmed this batch'\n- Scarcity without manipulation: be honest about actual capacity limits\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Creating Urgency Without Pressure in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Urgency must be real — fake urgency destroys trust permanently\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में दबाव के बिना तात्कालिकता बनाना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Urgency must be real — fake urgency destroys trust permanently",
    "keyPoints": [
      "Urgency must be real — fake urgency destroys trust permanently",
      "Real urgency triggers: festival season, limited batch slots, rate revision",
      "'We are starting a production run this week — want to join this batch?'",
      "Social proof urgency: '3 stores in your market already confirmed this batch'",
      "Scarcity without manipulation: be honest about actual capacity limits"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Creating Urgency Without Pressure'?",
        "questionHi": "'दबाव के बिना तात्कालिकता बनाना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Urgency must be real — fake urgency destroys trust permanently",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Urgency must be real — fake urgency destroys trust permanently",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Urgency must be real — fake urgency destroys trust permanently",
        "explanationHi": "मुख्य सिद्धांत: Urgency must be real — fake urgency destroys trust permanently"
      },
      {
        "questionEn": "In medicine pouch sales, 'Creating Urgency Without Pressure' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'दबाव के बिना तात्कालिकता बनाना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Creating Urgency Without Pressure'?",
        "questionHi": "'दबाव के बिना तात्कालिकता बनाना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Influence by Robert Cialdini",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Influence by Robert Cialdini",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Influence by Robert Cialdini",
        "explanationHi": "स्रोत: Influence by Robert Cialdini"
      },
      {
        "questionEn": "Key point 2 of 'Creating Urgency Without Pressure':",
        "questionHi": "'दबाव के बिना तात्कालिकता बनाना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Real urgency triggers: festival season, limited batch slots, rate revision",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Real urgency triggers: festival season, limited batch slots, rate revision",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Real urgency triggers: festival season, limited batch slots, rate revision",
        "explanationHi": "मुख्य बिंदु 2: Real urgency triggers: festival season, limited batch slots, rate revision"
      },
      {
        "questionEn": "The final key takeaway from 'Creating Urgency Without Pressure' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'दबाव के बिना तात्कालिकता बनाना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Scarcity without manipulation: be honest about actual capacity limits",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Scarcity without manipulation: be honest about actual capacity limits",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Scarcity without manipulation: be honest about actual capacity limits",
        "explanationHi": "अंतिम सीख: Scarcity without manipulation: be honest about actual capacity limits"
      }
    ]
  },
  {
    "orderIndex": 45,
    "groupNumber": 8,
    "titleEn": "High-Value Account Strategy — The Big Fish Approach",
    "titleHi": "हाई-वैल्यू अकाउंट रणनीति",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "ADVANCED",
    "estimatedMins": 14,
    "contentEn": "This topic covers High-Value Account Strategy — The Big Fish Approach — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- High-value account: hospital pharmacy, chain pharmacy, large standalone store\n- These accounts need 3 to 5 touches minimum before first order\n- Invest in a physical sample visit for accounts with 10000 plus unit potential\n- Decision cycle for large accounts is 30 to 90 days — plan accordingly\n- One high-value account can equal 10 regular accounts in revenue\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक हाई-वैल्यू अकाउंट रणनीति को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- High-value account: hospital pharmacy, chain pharmacy, large standalone store\n- These accounts need 3 to 5 touches minimum before first order\n- Invest in a physical sample visit for accounts with 10000 plus unit potential\n- Decision cycle for large accounts is 30 to 90 days — plan accordingly\n- One high-value account can equal 10 regular accounts in revenue\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying High-Value Account Strategy in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: High-value account: hospital pharmacy, chain pharmacy, large standalone store\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में हाई-वैल्यू अकाउंट रणनीति लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: High-value account: hospital pharmacy, chain pharmacy, large standalone store",
    "keyPoints": [
      "High-value account: hospital pharmacy, chain pharmacy, large standalone store",
      "These accounts need 3 to 5 touches minimum before first order",
      "Invest in a physical sample visit for accounts with 10000 plus unit potential",
      "Decision cycle for large accounts is 30 to 90 days — plan accordingly",
      "One high-value account can equal 10 regular accounts in revenue"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'High-Value Account Strategy'?",
        "questionHi": "'हाई-वैल्यू अकाउंट रणनीति' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "High-value account: hospital pharmacy, chain pharmacy, large standalone store",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "High-value account: hospital pharmacy, chain pharmacy, large standalone store",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: High-value account: hospital pharmacy, chain pharmacy, large standalone store",
        "explanationHi": "मुख्य सिद्धांत: High-value account: hospital pharmacy, chain pharmacy, large standalone store"
      },
      {
        "questionEn": "In medicine pouch sales, 'High-Value Account Strategy' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'हाई-वैल्यू अकाउंट रणनीति' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'High-Value Account Strategy'?",
        "questionHi": "'हाई-वैल्यू अकाउंट रणनीति' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'High-Value Account Strategy — The Big Fish Approach':",
        "questionHi": "'हाई-वैल्यू अकाउंट रणनीति' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "These accounts need 3 to 5 touches minimum before first order",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "These accounts need 3 to 5 touches minimum before first order",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: These accounts need 3 to 5 touches minimum before first order",
        "explanationHi": "मुख्य बिंदु 2: These accounts need 3 to 5 touches minimum before first order"
      },
      {
        "questionEn": "The final key takeaway from 'High-Value Account Strategy — The Big Fish Approach' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'हाई-वैल्यू अकाउंट रणनीति' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "One high-value account can equal 10 regular accounts in revenue",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "One high-value account can equal 10 regular accounts in revenue",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: One high-value account can equal 10 regular accounts in revenue",
        "explanationHi": "अंतिम सीख: One high-value account can equal 10 regular accounts in revenue"
      }
    ]
  },
  {
    "orderIndex": 46,
    "groupNumber": 8,
    "titleEn": "Reorder Prediction — When Will They Need More?",
    "titleHi": "रीऑर्डर भविष्यवाणी",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "ADVANCED",
    "estimatedMins": 10,
    "contentEn": "This topic covers Reorder Prediction — When Will They Need More? — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Sales Bible by Jeffrey Gitomer: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Calculate reorder date: delivery date plus months of supply at their daily usage\n- For 50 patients per day using 30 pouches: 5000 pieces = 167 days\n- Set a reorder reminder 30 days before calculated depletion date\n- Proactive reorder call: 'Your first batch is probably running low by now'\n- Pre-empting the reorder builds loyalty and prevents competition entry\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक रीऑर्डर भविष्यवाणी को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Sales Bible by Jeffrey Gitomer से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Calculate reorder date: delivery date plus months of supply at their daily usage\n- For 50 patients per day using 30 pouches: 5000 pieces = 167 days\n- Set a reorder reminder 30 days before calculated depletion date\n- Proactive reorder call: 'Your first batch is probably running low by now'\n- Pre-empting the reorder builds loyalty and prevents competition entry\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Reorder Prediction in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Calculate reorder date: delivery date plus months of supply at their daily usage\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में रीऑर्डर भविष्यवाणी लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Calculate reorder date: delivery date plus months of supply at their daily usage",
    "keyPoints": [
      "Calculate reorder date: delivery date plus months of supply at their daily usage",
      "For 50 patients per day using 30 pouches: 5000 pieces = 167 days",
      "Set a reorder reminder 30 days before calculated depletion date",
      "Proactive reorder call: 'Your first batch is probably running low by now'",
      "Pre-empting the reorder builds loyalty and prevents competition entry"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Reorder Prediction'?",
        "questionHi": "'रीऑर्डर भविष्यवाणी' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Calculate reorder date: delivery date plus months of supply at their daily usage",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Calculate reorder date: delivery date plus months of supply at their daily usage",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Calculate reorder date: delivery date plus months of supply at their daily usage",
        "explanationHi": "मुख्य सिद्धांत: Calculate reorder date: delivery date plus months of supply at their daily usage"
      },
      {
        "questionEn": "In medicine pouch sales, 'Reorder Prediction' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'रीऑर्डर भविष्यवाणी' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Reorder Prediction'?",
        "questionHi": "'रीऑर्डर भविष्यवाणी' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Sales Bible by Jeffrey Gitomer",
        "explanationHi": "स्रोत: The Sales Bible by Jeffrey Gitomer"
      },
      {
        "questionEn": "Key point 2 of 'Reorder Prediction — When Will They Need More?':",
        "questionHi": "'रीऑर्डर भविष्यवाणी' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "For 50 patients per day using 30 pouches: 5000 pieces = 167 days",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "For 50 patients per day using 30 pouches: 5000 pieces = 167 days",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: For 50 patients per day using 30 pouches: 5000 pieces = 167 days",
        "explanationHi": "मुख्य बिंदु 2: For 50 patients per day using 30 pouches: 5000 pieces = 167 days"
      },
      {
        "questionEn": "The final key takeaway from 'Reorder Prediction — When Will They Need More?' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'रीऑर्डर भविष्यवाणी' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Pre-empting the reorder builds loyalty and prevents competition entry",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Pre-empting the reorder builds loyalty and prevents competition entry",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Pre-empting the reorder builds loyalty and prevents competition entry",
        "explanationHi": "अंतिम सीख: Pre-empting the reorder builds loyalty and prevents competition entry"
      }
    ]
  },
  {
    "orderIndex": 47,
    "groupNumber": 8,
    "titleEn": "Complaint Handling — Turning Problems into Loyalty",
    "titleHi": "शिकायत संभालना",
    "sourceBook": "The Trusted Advisor by David Maister",
    "difficulty": "ADVANCED",
    "estimatedMins": 11,
    "contentEn": "This topic covers Complaint Handling — Turning Problems into Loyalty — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Trusted Advisor by David Maister: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- A complaint handled well creates MORE loyalty than no complaint at all\n- First response: listen completely without interrupting or defending\n- Acknowledge: 'You are absolutely right to raise this — I take full responsibility'\n- Resolution: offer reprint, credit, or replacement within 24 to 48 hours\n- Follow-up: call 3 days after resolution to confirm satisfaction\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक शिकायत संभालना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Trusted Advisor by David Maister से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- A complaint handled well creates MORE loyalty than no complaint at all\n- First response: listen completely without interrupting or defending\n- Acknowledge: 'You are absolutely right to raise this — I take full responsibility'\n- Resolution: offer reprint, credit, or replacement within 24 to 48 hours\n- Follow-up: call 3 days after resolution to confirm satisfaction\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Complaint Handling in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: A complaint handled well creates MORE loyalty than no complaint at all\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में शिकायत संभालना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: A complaint handled well creates MORE loyalty than no complaint at all",
    "keyPoints": [
      "A complaint handled well creates MORE loyalty than no complaint at all",
      "First response: listen completely without interrupting or defending",
      "Acknowledge: 'You are absolutely right to raise this — I take full responsibility'",
      "Resolution: offer reprint, credit, or replacement within 24 to 48 hours",
      "Follow-up: call 3 days after resolution to confirm satisfaction"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Complaint Handling'?",
        "questionHi": "'शिकायत संभालना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "A complaint handled well creates MORE loyalty than no complaint at all",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "A complaint handled well creates MORE loyalty than no complaint at all",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: A complaint handled well creates MORE loyalty than no complaint at all",
        "explanationHi": "मुख्य सिद्धांत: A complaint handled well creates MORE loyalty than no complaint at all"
      },
      {
        "questionEn": "In medicine pouch sales, 'Complaint Handling' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'शिकायत संभालना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Complaint Handling'?",
        "questionHi": "'शिकायत संभालना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Trusted Advisor by David Maister",
        "explanationHi": "स्रोत: The Trusted Advisor by David Maister"
      },
      {
        "questionEn": "Key point 2 of 'Complaint Handling — Turning Problems into Loyalty':",
        "questionHi": "'शिकायत संभालना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "First response: listen completely without interrupting or defending",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "First response: listen completely without interrupting or defending",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: First response: listen completely without interrupting or defending",
        "explanationHi": "मुख्य बिंदु 2: First response: listen completely without interrupting or defending"
      },
      {
        "questionEn": "The final key takeaway from 'Complaint Handling — Turning Problems into Loyalty' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'शिकायत संभालना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Follow-up: call 3 days after resolution to confirm satisfaction",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Follow-up: call 3 days after resolution to confirm satisfaction",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Follow-up: call 3 days after resolution to confirm satisfaction",
        "explanationHi": "अंतिम सीख: Follow-up: call 3 days after resolution to confirm satisfaction"
      }
    ]
  },
  {
    "orderIndex": 48,
    "groupNumber": 8,
    "titleEn": "Building Champions Inside Organizations",
    "titleHi": "संगठनों के अंदर चैंपियन बनाना",
    "sourceBook": "The Challenger Sale",
    "difficulty": "ADVANCED",
    "estimatedMins": 13,
    "contentEn": "This topic covers Building Champions Inside Organizations — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- A champion is someone inside the account who advocates for you internally\n- Identify the champion: who responded best to your pitch?\n- Equip the champion: give them the 3-line pitch they can use with the owner\n- Champion motivation: 500 free pieces credit if they help close the order\n- Stay in touch with champions even between orders — they are your radar\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक संगठनों के अंदर चैंपियन बनाना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- A champion is someone inside the account who advocates for you internally\n- Identify the champion: who responded best to your pitch?\n- Equip the champion: give them the 3-line pitch they can use with the owner\n- Champion motivation: 500 free pieces credit if they help close the order\n- Stay in touch with champions even between orders — they are your radar\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Building Champions Inside Organizations in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: A champion is someone inside the account who advocates for you internally\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में संगठनों के अंदर चैंपियन बनाना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: A champion is someone inside the account who advocates for you internally",
    "keyPoints": [
      "A champion is someone inside the account who advocates for you internally",
      "Identify the champion: who responded best to your pitch?",
      "Equip the champion: give them the 3-line pitch they can use with the owner",
      "Champion motivation: 500 free pieces credit if they help close the order",
      "Stay in touch with champions even between orders — they are your radar"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Building Champions Inside Organizations'?",
        "questionHi": "'संगठनों के अंदर चैंपियन बनाना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "A champion is someone inside the account who advocates for you internally",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "A champion is someone inside the account who advocates for you internally",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: A champion is someone inside the account who advocates for you internally",
        "explanationHi": "मुख्य सिद्धांत: A champion is someone inside the account who advocates for you internally"
      },
      {
        "questionEn": "In medicine pouch sales, 'Building Champions Inside Organizations' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'संगठनों के अंदर चैंपियन बनाना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Building Champions Inside Organizations'?",
        "questionHi": "'संगठनों के अंदर चैंपियन बनाना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'Building Champions Inside Organizations':",
        "questionHi": "'संगठनों के अंदर चैंपियन बनाना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Identify the champion: who responded best to your pitch?",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Identify the champion: who responded best to your pitch?",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Identify the champion: who responded best to your pitch?",
        "explanationHi": "मुख्य बिंदु 2: Identify the champion: who responded best to your pitch?"
      },
      {
        "questionEn": "The final key takeaway from 'Building Champions Inside Organizations' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'संगठनों के अंदर चैंपियन बनाना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Stay in touch with champions even between orders — they are your radar",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Stay in touch with champions even between orders — they are your radar",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Stay in touch with champions even between orders — they are your radar",
        "explanationHi": "अंतिम सीख: Stay in touch with champions even between orders — they are your radar"
      }
    ]
  },
  {
    "orderIndex": 49,
    "groupNumber": 8,
    "titleEn": "Social Media for Medicine Pouch Leads",
    "titleHi": "सोशल मीडिया से लीड्स",
    "sourceBook": "Sell or Be Sold by Grant Cardone",
    "difficulty": "ADVANCED",
    "estimatedMins": 10,
    "contentEn": "This topic covers Social Media for Medicine Pouch Leads — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Sell or Be Sold by Grant Cardone: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- WhatsApp status: post new design showcases every 2 weeks\n- Instagram: before and after — plain bag to branded pouch photos\n- LinkedIn: reach chain pharmacy procurement managers directly\n- Facebook groups: medical store owner groups in Maharashtra and Gujarat\n- Social proof posts: 'Just delivered to 500 stores this quarter' builds credibility\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक सोशल मीडिया से लीड्स को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nSell or Be Sold by Grant Cardone से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- WhatsApp status: post new design showcases every 2 weeks\n- Instagram: before and after — plain bag to branded pouch photos\n- LinkedIn: reach chain pharmacy procurement managers directly\n- Facebook groups: medical store owner groups in Maharashtra and Gujarat\n- Social proof posts: 'Just delivered to 500 stores this quarter' builds credibility\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Social Media for Medicine Pouch Leads in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: WhatsApp status: post new design showcases every 2 weeks\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में सोशल मीडिया से लीड्स लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: WhatsApp status: post new design showcases every 2 weeks",
    "keyPoints": [
      "WhatsApp status: post new design showcases every 2 weeks",
      "Instagram: before and after — plain bag to branded pouch photos",
      "LinkedIn: reach chain pharmacy procurement managers directly",
      "Facebook groups: medical store owner groups in Maharashtra and Gujarat",
      "Social proof posts: 'Just delivered to 500 stores this quarter' builds credibility"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Social Media for Medicine Pouch Leads'?",
        "questionHi": "'सोशल मीडिया से लीड्स' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "WhatsApp status: post new design showcases every 2 weeks",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "WhatsApp status: post new design showcases every 2 weeks",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: WhatsApp status: post new design showcases every 2 weeks",
        "explanationHi": "मुख्य सिद्धांत: WhatsApp status: post new design showcases every 2 weeks"
      },
      {
        "questionEn": "In medicine pouch sales, 'Social Media for Medicine Pouch Leads' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'सोशल मीडिया से लीड्स' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Social Media for Medicine Pouch Leads'?",
        "questionHi": "'सोशल मीडिया से लीड्स' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Sell or Be Sold by Grant Cardone",
        "explanationHi": "स्रोत: Sell or Be Sold by Grant Cardone"
      },
      {
        "questionEn": "Key point 2 of 'Social Media for Medicine Pouch Leads':",
        "questionHi": "'सोशल मीडिया से लीड्स' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Instagram: before and after — plain bag to branded pouch photos",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Instagram: before and after — plain bag to branded pouch photos",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Instagram: before and after — plain bag to branded pouch photos",
        "explanationHi": "मुख्य बिंदु 2: Instagram: before and after — plain bag to branded pouch photos"
      },
      {
        "questionEn": "The final key takeaway from 'Social Media for Medicine Pouch Leads' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'सोशल मीडिया से लीड्स' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Social proof posts: 'Just delivered to 500 stores this quarter' builds credibility",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Social proof posts: 'Just delivered to 500 stores this quarter' builds credibility",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Social proof posts: 'Just delivered to 500 stores this quarter' builds credibility",
        "explanationHi": "अंतिम सीख: Social proof posts: 'Just delivered to 500 stores this quarter' builds credibility"
      }
    ]
  },
  {
    "orderIndex": 50,
    "groupNumber": 8,
    "titleEn": "The Power Dialer Strategy — Maximum Calls Per Hour",
    "titleHi": "पावर डायलर रणनीति",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "ADVANCED",
    "estimatedMins": 12,
    "contentEn": "This topic covers The Power Dialer Strategy — Maximum Calls Per Hour — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Power dialing: make calls in rapid succession without breaks between dials\n- Pre-write your opening 30 seconds so no thinking slows the dial pace\n- Batching: do all cold calls together then all warm follow-ups together\n- Energy management: sprint for 45 minutes then take a 15-minute break\n- Track calls per hour to find your personal optimal calling rhythm\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक पावर डायलर रणनीति को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Power dialing: make calls in rapid succession without breaks between dials\n- Pre-write your opening 30 seconds so no thinking slows the dial pace\n- Batching: do all cold calls together then all warm follow-ups together\n- Energy management: sprint for 45 minutes then take a 15-minute break\n- Track calls per hour to find your personal optimal calling rhythm\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Power Dialer Strategy in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Power dialing: make calls in rapid succession without breaks between dials\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में पावर डायलर रणनीति लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Power dialing: make calls in rapid succession without breaks between dials",
    "keyPoints": [
      "Power dialing: make calls in rapid succession without breaks between dials",
      "Pre-write your opening 30 seconds so no thinking slows the dial pace",
      "Batching: do all cold calls together then all warm follow-ups together",
      "Energy management: sprint for 45 minutes then take a 15-minute break",
      "Track calls per hour to find your personal optimal calling rhythm"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Power Dialer Strategy'?",
        "questionHi": "'पावर डायलर रणनीति' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Power dialing: make calls in rapid succession without breaks between dials",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Power dialing: make calls in rapid succession without breaks between dials",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Power dialing: make calls in rapid succession without breaks between dials",
        "explanationHi": "मुख्य सिद्धांत: Power dialing: make calls in rapid succession without breaks between dials"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Power Dialer Strategy' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'पावर डायलर रणनीति' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Power Dialer Strategy'?",
        "questionHi": "'पावर डायलर रणनीति' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'The Power Dialer Strategy — Maximum Calls Per Hour':",
        "questionHi": "'पावर डायलर रणनीति' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Pre-write your opening 30 seconds so no thinking slows the dial pace",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Pre-write your opening 30 seconds so no thinking slows the dial pace",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Pre-write your opening 30 seconds so no thinking slows the dial pace",
        "explanationHi": "मुख्य बिंदु 2: Pre-write your opening 30 seconds so no thinking slows the dial pace"
      },
      {
        "questionEn": "The final key takeaway from 'The Power Dialer Strategy — Maximum Calls Per Hour' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'पावर डायलर रणनीति' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Track calls per hour to find your personal optimal calling rhythm",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Track calls per hour to find your personal optimal calling rhythm",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Track calls per hour to find your personal optimal calling rhythm",
        "explanationHi": "अंतिम सीख: Track calls per hour to find your personal optimal calling rhythm"
      }
    ]
  },
  {
    "orderIndex": 51,
    "groupNumber": 9,
    "titleEn": "Team Coaching — Teaching What You Know",
    "titleHi": "टीम कोचिंग",
    "sourceBook": "The Trusted Advisor by David Maister",
    "difficulty": "PRO",
    "estimatedMins": 15,
    "contentEn": "This topic covers Team Coaching — Teaching What You Know — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Trusted Advisor by David Maister: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Teaching others forces you to clarify your own understanding of each skill\n- Shadow calls: let junior teammates listen to your best calls live\n- Role play: 5 minutes of objection practice before the calling block daily\n- Debrief after every call: what worked, what would I change, what to try\n- The best sales managers were first the best individual performers\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक टीम कोचिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Trusted Advisor by David Maister से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Teaching others forces you to clarify your own understanding of each skill\n- Shadow calls: let junior teammates listen to your best calls live\n- Role play: 5 minutes of objection practice before the calling block daily\n- Debrief after every call: what worked, what would I change, what to try\n- The best sales managers were first the best individual performers\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Team Coaching in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Teaching others forces you to clarify your own understanding of each skill\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में टीम कोचिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Teaching others forces you to clarify your own understanding of each skill",
    "keyPoints": [
      "Teaching others forces you to clarify your own understanding of each skill",
      "Shadow calls: let junior teammates listen to your best calls live",
      "Role play: 5 minutes of objection practice before the calling block daily",
      "Debrief after every call: what worked, what would I change, what to try",
      "The best sales managers were first the best individual performers"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Team Coaching'?",
        "questionHi": "'टीम कोचिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Teaching others forces you to clarify your own understanding of each skill",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Teaching others forces you to clarify your own understanding of each skill",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Teaching others forces you to clarify your own understanding of each skill",
        "explanationHi": "मुख्य सिद्धांत: Teaching others forces you to clarify your own understanding of each skill"
      },
      {
        "questionEn": "In medicine pouch sales, 'Team Coaching' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'टीम कोचिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Team Coaching'?",
        "questionHi": "'टीम कोचिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Trusted Advisor by David Maister",
        "explanationHi": "स्रोत: The Trusted Advisor by David Maister"
      },
      {
        "questionEn": "Key point 2 of 'Team Coaching — Teaching What You Know':",
        "questionHi": "'टीम कोचिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Shadow calls: let junior teammates listen to your best calls live",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Shadow calls: let junior teammates listen to your best calls live",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Shadow calls: let junior teammates listen to your best calls live",
        "explanationHi": "मुख्य बिंदु 2: Shadow calls: let junior teammates listen to your best calls live"
      },
      {
        "questionEn": "The final key takeaway from 'Team Coaching — Teaching What You Know' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'टीम कोचिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "The best sales managers were first the best individual performers",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "The best sales managers were first the best individual performers",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: The best sales managers were first the best individual performers",
        "explanationHi": "अंतिम सीख: The best sales managers were first the best individual performers"
      }
    ]
  },
  {
    "orderIndex": 52,
    "groupNumber": 9,
    "titleEn": "CRM-Based Selling — Letting Data Drive Your Sales",
    "titleHi": "CRM-आधारित बिक्री",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "PRO",
    "estimatedMins": 14,
    "contentEn": "This topic covers CRM-Based Selling — Letting Data Drive Your Sales — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Track every lead, every call, every follow-up in a CRM or spreadsheet\n- CRM data reveals: average touches to close, best call times, top objections\n- Pipeline review weekly: which accounts are stalled and why?\n- Use data to identify your top 20 percent accounts generating 80 percent revenue\n- CRM discipline separates professional salespeople from amateurs\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक CRM-आधारित बिक्री को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Track every lead, every call, every follow-up in a CRM or spreadsheet\n- CRM data reveals: average touches to close, best call times, top objections\n- Pipeline review weekly: which accounts are stalled and why?\n- Use data to identify your top 20 percent accounts generating 80 percent revenue\n- CRM discipline separates professional salespeople from amateurs\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying CRM-Based Selling in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Track every lead, every call, every follow-up in a CRM or spreadsheet\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में CRM-आधारित बिक्री लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Track every lead, every call, every follow-up in a CRM or spreadsheet",
    "keyPoints": [
      "Track every lead, every call, every follow-up in a CRM or spreadsheet",
      "CRM data reveals: average touches to close, best call times, top objections",
      "Pipeline review weekly: which accounts are stalled and why?",
      "Use data to identify your top 20 percent accounts generating 80 percent revenue",
      "CRM discipline separates professional salespeople from amateurs"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'CRM-Based Selling'?",
        "questionHi": "'CRM-आधारित बिक्री' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Track every lead, every call, every follow-up in a CRM or spreadsheet",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Track every lead, every call, every follow-up in a CRM or spreadsheet",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Track every lead, every call, every follow-up in a CRM or spreadsheet",
        "explanationHi": "मुख्य सिद्धांत: Track every lead, every call, every follow-up in a CRM or spreadsheet"
      },
      {
        "questionEn": "In medicine pouch sales, 'CRM-Based Selling' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'CRM-आधारित बिक्री' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'CRM-Based Selling'?",
        "questionHi": "'CRM-आधारित बिक्री' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'CRM-Based Selling — Letting Data Drive Your Sales':",
        "questionHi": "'CRM-आधारित बिक्री' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "CRM data reveals: average touches to close, best call times, top objections",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "CRM data reveals: average touches to close, best call times, top objections",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: CRM data reveals: average touches to close, best call times, top objections",
        "explanationHi": "मुख्य बिंदु 2: CRM data reveals: average touches to close, best call times, top objections"
      },
      {
        "questionEn": "The final key takeaway from 'CRM-Based Selling — Letting Data Drive Your Sales' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'CRM-आधारित बिक्री' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "CRM discipline separates professional salespeople from amateurs",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "CRM discipline separates professional salespeople from amateurs",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: CRM discipline separates professional salespeople from amateurs",
        "explanationHi": "अंतिम सीख: CRM discipline separates professional salespeople from amateurs"
      }
    ]
  },
  {
    "orderIndex": 53,
    "groupNumber": 9,
    "titleEn": "Analytics-Driven Prospecting — Finding the Right Stores",
    "titleHi": "एनालिटिक्स-आधारित प्रॉस्पेक्टिंग",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "PRO",
    "estimatedMins": 13,
    "contentEn": "This topic covers Analytics-Driven Prospecting — Finding the Right Stores — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Use Google Maps to identify store size by review count and ratings\n- Stores with 50 plus reviews in a medical area = high footfall prospect\n- Cross-reference with your existing customer map to find coverage gaps\n- Track which areas have highest conversion rate and allocate more time there\n- Data tells you where to spend time — not just who to call\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक एनालिटिक्स-आधारित प्रॉस्पेक्टिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Use Google Maps to identify store size by review count and ratings\n- Stores with 50 plus reviews in a medical area = high footfall prospect\n- Cross-reference with your existing customer map to find coverage gaps\n- Track which areas have highest conversion rate and allocate more time there\n- Data tells you where to spend time — not just who to call\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Analytics-Driven Prospecting in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Use Google Maps to identify store size by review count and ratings\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में एनालिटिक्स-आधारित प्रॉस्पेक्टिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Use Google Maps to identify store size by review count and ratings",
    "keyPoints": [
      "Use Google Maps to identify store size by review count and ratings",
      "Stores with 50 plus reviews in a medical area = high footfall prospect",
      "Cross-reference with your existing customer map to find coverage gaps",
      "Track which areas have highest conversion rate and allocate more time there",
      "Data tells you where to spend time — not just who to call"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Analytics-Driven Prospecting'?",
        "questionHi": "'एनालिटिक्स-आधारित प्रॉस्पेक्टिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Use Google Maps to identify store size by review count and ratings",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Use Google Maps to identify store size by review count and ratings",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Use Google Maps to identify store size by review count and ratings",
        "explanationHi": "मुख्य सिद्धांत: Use Google Maps to identify store size by review count and ratings"
      },
      {
        "questionEn": "In medicine pouch sales, 'Analytics-Driven Prospecting' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'एनालिटिक्स-आधारित प्रॉस्पेक्टिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Analytics-Driven Prospecting'?",
        "questionHi": "'एनालिटिक्स-आधारित प्रॉस्पेक्टिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'Analytics-Driven Prospecting — Finding the Right Stores':",
        "questionHi": "'एनालिटिक्स-आधारित प्रॉस्पेक्टिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Stores with 50 plus reviews in a medical area = high footfall prospect",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Stores with 50 plus reviews in a medical area = high footfall prospect",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Stores with 50 plus reviews in a medical area = high footfall prospect",
        "explanationHi": "मुख्य बिंदु 2: Stores with 50 plus reviews in a medical area = high footfall prospect"
      },
      {
        "questionEn": "The final key takeaway from 'Analytics-Driven Prospecting — Finding the Right Stores' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'एनालिटिक्स-आधारित प्रॉस्पेक्टिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Data tells you where to spend time — not just who to call",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Data tells you where to spend time — not just who to call",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Data tells you where to spend time — not just who to call",
        "explanationHi": "अंतिम सीख: Data tells you where to spend time — not just who to call"
      }
    ]
  },
  {
    "orderIndex": 54,
    "groupNumber": 9,
    "titleEn": "Scaling Territory — From Solo to Team",
    "titleHi": "क्षेत्र स्केलिंग",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "PRO",
    "estimatedMins": 14,
    "contentEn": "This topic covers Scaling Territory — From Solo to Team — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Sales Bible by Jeffrey Gitomer: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Document your best scripts, objection responses, and follow-up sequences\n- Create a playbook: what works in Maharashtra may not work in Gujarat\n- Onboard new team members with a 30-day call shadowing program\n- Territory segmentation: assign team members by geography not random lists\n- Measure team performance weekly: calls, samples sent, orders closed\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक क्षेत्र स्केलिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Sales Bible by Jeffrey Gitomer से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Document your best scripts, objection responses, and follow-up sequences\n- Create a playbook: what works in Maharashtra may not work in Gujarat\n- Onboard new team members with a 30-day call shadowing program\n- Territory segmentation: assign team members by geography not random lists\n- Measure team performance weekly: calls, samples sent, orders closed\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Scaling Territory in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Document your best scripts, objection responses, and follow-up sequences\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में क्षेत्र स्केलिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Document your best scripts, objection responses, and follow-up sequences",
    "keyPoints": [
      "Document your best scripts, objection responses, and follow-up sequences",
      "Create a playbook: what works in Maharashtra may not work in Gujarat",
      "Onboard new team members with a 30-day call shadowing program",
      "Territory segmentation: assign team members by geography not random lists",
      "Measure team performance weekly: calls, samples sent, orders closed"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Scaling Territory'?",
        "questionHi": "'क्षेत्र स्केलिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Document your best scripts, objection responses, and follow-up sequences",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Document your best scripts, objection responses, and follow-up sequences",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Document your best scripts, objection responses, and follow-up sequences",
        "explanationHi": "मुख्य सिद्धांत: Document your best scripts, objection responses, and follow-up sequences"
      },
      {
        "questionEn": "In medicine pouch sales, 'Scaling Territory' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'क्षेत्र स्केलिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Scaling Territory'?",
        "questionHi": "'क्षेत्र स्केलिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Sales Bible by Jeffrey Gitomer",
        "explanationHi": "स्रोत: The Sales Bible by Jeffrey Gitomer"
      },
      {
        "questionEn": "Key point 2 of 'Scaling Territory — From Solo to Team':",
        "questionHi": "'क्षेत्र स्केलिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Create a playbook: what works in Maharashtra may not work in Gujarat",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Create a playbook: what works in Maharashtra may not work in Gujarat",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Create a playbook: what works in Maharashtra may not work in Gujarat",
        "explanationHi": "मुख्य बिंदु 2: Create a playbook: what works in Maharashtra may not work in Gujarat"
      },
      {
        "questionEn": "The final key takeaway from 'Scaling Territory — From Solo to Team' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'क्षेत्र स्केलिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Measure team performance weekly: calls, samples sent, orders closed",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Measure team performance weekly: calls, samples sent, orders closed",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Measure team performance weekly: calls, samples sent, orders closed",
        "explanationHi": "अंतिम सीख: Measure team performance weekly: calls, samples sent, orders closed"
      }
    ]
  },
  {
    "orderIndex": 55,
    "groupNumber": 9,
    "titleEn": "Managing Key Accounts — The Platinum Customer Strategy",
    "titleHi": "प्रमुख अकाउंट प्रबंधन",
    "sourceBook": "The Trusted Advisor by David Maister",
    "difficulty": "PRO",
    "estimatedMins": 15,
    "contentEn": "This topic covers Managing Key Accounts — The Platinum Customer Strategy — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Trusted Advisor by David Maister: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Key accounts are top 10 percent by order volume — give them VIP treatment\n- Quarterly business review: visit or call to review their packaging needs\n- Key account exclusivity: offer first access to new designs and sizes\n- Dedicated contact: key accounts always reach you directly not a junior rep\n- Key account churn is catastrophic — prevention is far cheaper than recovery\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक प्रमुख अकाउंट प्रबंधन को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Trusted Advisor by David Maister से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Key accounts are top 10 percent by order volume — give them VIP treatment\n- Quarterly business review: visit or call to review their packaging needs\n- Key account exclusivity: offer first access to new designs and sizes\n- Dedicated contact: key accounts always reach you directly not a junior rep\n- Key account churn is catastrophic — prevention is far cheaper than recovery\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Managing Key Accounts in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Key accounts are top 10 percent by order volume — give them VIP treatment\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में प्रमुख अकाउंट प्रबंधन लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Key accounts are top 10 percent by order volume — give them VIP treatment",
    "keyPoints": [
      "Key accounts are top 10 percent by order volume — give them VIP treatment",
      "Quarterly business review: visit or call to review their packaging needs",
      "Key account exclusivity: offer first access to new designs and sizes",
      "Dedicated contact: key accounts always reach you directly not a junior rep",
      "Key account churn is catastrophic — prevention is far cheaper than recovery"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Managing Key Accounts'?",
        "questionHi": "'प्रमुख अकाउंट प्रबंधन' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Key accounts are top 10 percent by order volume — give them VIP treatment",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Key accounts are top 10 percent by order volume — give them VIP treatment",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Key accounts are top 10 percent by order volume — give them VIP treatment",
        "explanationHi": "मुख्य सिद्धांत: Key accounts are top 10 percent by order volume — give them VIP treatment"
      },
      {
        "questionEn": "In medicine pouch sales, 'Managing Key Accounts' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'प्रमुख अकाउंट प्रबंधन' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Managing Key Accounts'?",
        "questionHi": "'प्रमुख अकाउंट प्रबंधन' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Trusted Advisor by David Maister",
        "explanationHi": "स्रोत: The Trusted Advisor by David Maister"
      },
      {
        "questionEn": "Key point 2 of 'Managing Key Accounts — The Platinum Customer Strategy':",
        "questionHi": "'प्रमुख अकाउंट प्रबंधन' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Quarterly business review: visit or call to review their packaging needs",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Quarterly business review: visit or call to review their packaging needs",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Quarterly business review: visit or call to review their packaging needs",
        "explanationHi": "मुख्य बिंदु 2: Quarterly business review: visit or call to review their packaging needs"
      },
      {
        "questionEn": "The final key takeaway from 'Managing Key Accounts — The Platinum Customer Strategy' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'प्रमुख अकाउंट प्रबंधन' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Key account churn is catastrophic — prevention is far cheaper than recovery",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Key account churn is catastrophic — prevention is far cheaper than recovery",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Key account churn is catastrophic — prevention is far cheaper than recovery",
        "explanationHi": "अंतिम सीख: Key account churn is catastrophic — prevention is far cheaper than recovery"
      }
    ]
  },
  {
    "orderIndex": 56,
    "groupNumber": 9,
    "titleEn": "Brand Storytelling for Pharmacy Chains",
    "titleHi": "ब्रांड स्टोरीटेलिंग",
    "sourceBook": "To Sell is Human by Daniel Pink",
    "difficulty": "PRO",
    "estimatedMins": 14,
    "contentEn": "This topic covers Brand Storytelling for Pharmacy Chains — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from To Sell is Human by Daniel Pink: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Chain pharmacies buy a consistent brand story — not just a product\n- Pitch for chains: 'Every patient at every location will see the same professional look'\n- Create a brand narrative: RarePrint equals pharmacy professionalism at scale\n- Case study deck: 5 chain pharmacies with before and after brand consistency\n- Brand ROI for chains: calculate patient loyalty improvement across locations\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक ब्रांड स्टोरीटेलिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nTo Sell is Human by Daniel Pink से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Chain pharmacies buy a consistent brand story — not just a product\n- Pitch for chains: 'Every patient at every location will see the same professional look'\n- Create a brand narrative: RarePrint equals pharmacy professionalism at scale\n- Case study deck: 5 chain pharmacies with before and after brand consistency\n- Brand ROI for chains: calculate patient loyalty improvement across locations\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Brand Storytelling for Pharmacy Chains in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Chain pharmacies buy a consistent brand story — not just a product\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में ब्रांड स्टोरीटेलिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Chain pharmacies buy a consistent brand story — not just a product",
    "keyPoints": [
      "Chain pharmacies buy a consistent brand story — not just a product",
      "Pitch for chains: 'Every patient at every location will see the same professional look'",
      "Create a brand narrative: RarePrint equals pharmacy professionalism at scale",
      "Case study deck: 5 chain pharmacies with before and after brand consistency",
      "Brand ROI for chains: calculate patient loyalty improvement across locations"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Brand Storytelling for Pharmacy Chains'?",
        "questionHi": "'ब्रांड स्टोरीटेलिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Chain pharmacies buy a consistent brand story — not just a product",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Chain pharmacies buy a consistent brand story — not just a product",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Chain pharmacies buy a consistent brand story — not just a product",
        "explanationHi": "मुख्य सिद्धांत: Chain pharmacies buy a consistent brand story — not just a product"
      },
      {
        "questionEn": "In medicine pouch sales, 'Brand Storytelling for Pharmacy Chains' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'ब्रांड स्टोरीटेलिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Brand Storytelling for Pharmacy Chains'?",
        "questionHi": "'ब्रांड स्टोरीटेलिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "To Sell is Human by Daniel Pink",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "To Sell is Human by Daniel Pink",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: To Sell is Human by Daniel Pink",
        "explanationHi": "स्रोत: To Sell is Human by Daniel Pink"
      },
      {
        "questionEn": "Key point 2 of 'Brand Storytelling for Pharmacy Chains':",
        "questionHi": "'ब्रांड स्टोरीटेलिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Pitch for chains: 'Every patient at every location will see the same professional look'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Pitch for chains: 'Every patient at every location will see the same professional look'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Pitch for chains: 'Every patient at every location will see the same professional look'",
        "explanationHi": "मुख्य बिंदु 2: Pitch for chains: 'Every patient at every location will see the same professional look'"
      },
      {
        "questionEn": "The final key takeaway from 'Brand Storytelling for Pharmacy Chains' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'ब्रांड स्टोरीटेलिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Brand ROI for chains: calculate patient loyalty improvement across locations",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Brand ROI for chains: calculate patient loyalty improvement across locations",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Brand ROI for chains: calculate patient loyalty improvement across locations",
        "explanationHi": "अंतिम सीख: Brand ROI for chains: calculate patient loyalty improvement across locations"
      }
    ]
  },
  {
    "orderIndex": 57,
    "groupNumber": 9,
    "titleEn": "Advanced Negotiation — Multiple Variable Negotiation",
    "titleHi": "उन्नत बातचीत",
    "sourceBook": "Never Split the Difference by Chris Voss",
    "difficulty": "PRO",
    "estimatedMins": 15,
    "contentEn": "This topic covers Advanced Negotiation — Multiple Variable Negotiation — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Never Split the Difference by Chris Voss: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Never negotiate on price alone — introduce other variables\n- Variables: quantity, payment terms, delivery speed, design complexity, exclusivity\n- Trade lower price for higher quantity — protect your margin\n- Trade faster delivery for cash payment upfront\n- Creating a package deal feels like a win-win even when your margin is protected\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक उन्नत बातचीत को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nNever Split the Difference by Chris Voss से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Never negotiate on price alone — introduce other variables\n- Variables: quantity, payment terms, delivery speed, design complexity, exclusivity\n- Trade lower price for higher quantity — protect your margin\n- Trade faster delivery for cash payment upfront\n- Creating a package deal feels like a win-win even when your margin is protected\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Advanced Negotiation in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Never negotiate on price alone — introduce other variables\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में उन्नत बातचीत लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Never negotiate on price alone — introduce other variables",
    "keyPoints": [
      "Never negotiate on price alone — introduce other variables",
      "Variables: quantity, payment terms, delivery speed, design complexity, exclusivity",
      "Trade lower price for higher quantity — protect your margin",
      "Trade faster delivery for cash payment upfront",
      "Creating a package deal feels like a win-win even when your margin is protected"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Advanced Negotiation'?",
        "questionHi": "'उन्नत बातचीत' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Never negotiate on price alone — introduce other variables",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Never negotiate on price alone — introduce other variables",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Never negotiate on price alone — introduce other variables",
        "explanationHi": "मुख्य सिद्धांत: Never negotiate on price alone — introduce other variables"
      },
      {
        "questionEn": "In medicine pouch sales, 'Advanced Negotiation' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'उन्नत बातचीत' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Advanced Negotiation'?",
        "questionHi": "'उन्नत बातचीत' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Never Split the Difference by Chris Voss",
        "explanationHi": "स्रोत: Never Split the Difference by Chris Voss"
      },
      {
        "questionEn": "Key point 2 of 'Advanced Negotiation — Multiple Variable Negotiation':",
        "questionHi": "'उन्नत बातचीत' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Variables: quantity, payment terms, delivery speed, design complexity, exclusivity",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Variables: quantity, payment terms, delivery speed, design complexity, exclusivity",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Variables: quantity, payment terms, delivery speed, design complexity, exclusivity",
        "explanationHi": "मुख्य बिंदु 2: Variables: quantity, payment terms, delivery speed, design complexity, exclusivity"
      },
      {
        "questionEn": "The final key takeaway from 'Advanced Negotiation — Multiple Variable Negotiation' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'उन्नत बातचीत' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Creating a package deal feels like a win-win even when your margin is protected",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Creating a package deal feels like a win-win even when your margin is protected",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Creating a package deal feels like a win-win even when your margin is protected",
        "explanationHi": "अंतिम सीख: Creating a package deal feels like a win-win even when your margin is protected"
      }
    ]
  },
  {
    "orderIndex": 58,
    "groupNumber": 9,
    "titleEn": "Building a Referral Network That Generates Itself",
    "titleHi": "स्वयं-जनित रेफरल नेटवर्क",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "PRO",
    "estimatedMins": 13,
    "contentEn": "This topic covers Building a Referral Network That Generates Itself — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Sales Bible by Jeffrey Gitomer: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- A referral network generates leads without active prospecting\n- Systematize referral asks: at design approval, 15-day post-delivery, reorder\n- Referral tiers: bronze (1 referral), silver (3), gold (5) with increasing rewards\n- Pharmacy associations and WhatsApp groups = multiplier for referrals\n- Track referral sources: which customers send the best qualified leads?\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक स्वयं-जनित रेफरल नेटवर्क को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Sales Bible by Jeffrey Gitomer से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- A referral network generates leads without active prospecting\n- Systematize referral asks: at design approval, 15-day post-delivery, reorder\n- Referral tiers: bronze (1 referral), silver (3), gold (5) with increasing rewards\n- Pharmacy associations and WhatsApp groups = multiplier for referrals\n- Track referral sources: which customers send the best qualified leads?\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Building a Referral Network That Generates Itself in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: A referral network generates leads without active prospecting\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में स्वयं-जनित रेफरल नेटवर्क लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: A referral network generates leads without active prospecting",
    "keyPoints": [
      "A referral network generates leads without active prospecting",
      "Systematize referral asks: at design approval, 15-day post-delivery, reorder",
      "Referral tiers: bronze (1 referral), silver (3), gold (5) with increasing rewards",
      "Pharmacy associations and WhatsApp groups = multiplier for referrals",
      "Track referral sources: which customers send the best qualified leads?"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Building a Referral Network That Generates Itself'?",
        "questionHi": "'स्वयं-जनित रेफरल नेटवर्क' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "A referral network generates leads without active prospecting",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "A referral network generates leads without active prospecting",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: A referral network generates leads without active prospecting",
        "explanationHi": "मुख्य सिद्धांत: A referral network generates leads without active prospecting"
      },
      {
        "questionEn": "In medicine pouch sales, 'Building a Referral Network That Generates Itself' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'स्वयं-जनित रेफरल नेटवर्क' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Building a Referral Network That Generates Itself'?",
        "questionHi": "'स्वयं-जनित रेफरल नेटवर्क' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Sales Bible by Jeffrey Gitomer",
        "explanationHi": "स्रोत: The Sales Bible by Jeffrey Gitomer"
      },
      {
        "questionEn": "Key point 2 of 'Building a Referral Network That Generates Itself':",
        "questionHi": "'स्वयं-जनित रेफरल नेटवर्क' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Systematize referral asks: at design approval, 15-day post-delivery, reorder",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Systematize referral asks: at design approval, 15-day post-delivery, reorder",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Systematize referral asks: at design approval, 15-day post-delivery, reorder",
        "explanationHi": "मुख्य बिंदु 2: Systematize referral asks: at design approval, 15-day post-delivery, reorder"
      },
      {
        "questionEn": "The final key takeaway from 'Building a Referral Network That Generates Itself' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'स्वयं-जनित रेफरल नेटवर्क' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Track referral sources: which customers send the best qualified leads?",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Track referral sources: which customers send the best qualified leads?",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Track referral sources: which customers send the best qualified leads?",
        "explanationHi": "अंतिम सीख: Track referral sources: which customers send the best qualified leads?"
      }
    ]
  },
  {
    "orderIndex": 59,
    "groupNumber": 9,
    "titleEn": "Pricing Strategy — When and How to Raise Prices",
    "titleHi": "मूल्य निर्धारण रणनीति",
    "sourceBook": "Predictably Irrational by Dan Ariely",
    "difficulty": "PRO",
    "estimatedMins": 14,
    "contentEn": "This topic covers Pricing Strategy — When and How to Raise Prices — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Predictably Irrational by Dan Ariely: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Price increases should be planned and communicated in advance — never surprise\n- Annual price review: paper cost increases, GST changes, logistics costs\n- Grandfather loyal accounts: hold price for 6 months before applying increase\n- Communicate increase with a reason: 'Paper costs have risen 15 percent this year'\n- Use price increase as a reason to push customers to larger orders at old rates\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक मूल्य निर्धारण रणनीति को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nPredictably Irrational by Dan Ariely से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Price increases should be planned and communicated in advance — never surprise\n- Annual price review: paper cost increases, GST changes, logistics costs\n- Grandfather loyal accounts: hold price for 6 months before applying increase\n- Communicate increase with a reason: 'Paper costs have risen 15 percent this year'\n- Use price increase as a reason to push customers to larger orders at old rates\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Pricing Strategy in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Price increases should be planned and communicated in advance — never surprise\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में मूल्य निर्धारण रणनीति लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Price increases should be planned and communicated in advance — never surprise",
    "keyPoints": [
      "Price increases should be planned and communicated in advance — never surprise",
      "Annual price review: paper cost increases, GST changes, logistics costs",
      "Grandfather loyal accounts: hold price for 6 months before applying increase",
      "Communicate increase with a reason: 'Paper costs have risen 15 percent this year'",
      "Use price increase as a reason to push customers to larger orders at old rates"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Pricing Strategy'?",
        "questionHi": "'मूल्य निर्धारण रणनीति' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Price increases should be planned and communicated in advance — never surprise",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Price increases should be planned and communicated in advance — never surprise",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Price increases should be planned and communicated in advance — never surprise",
        "explanationHi": "मुख्य सिद्धांत: Price increases should be planned and communicated in advance — never surprise"
      },
      {
        "questionEn": "In medicine pouch sales, 'Pricing Strategy' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'मूल्य निर्धारण रणनीति' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Pricing Strategy'?",
        "questionHi": "'मूल्य निर्धारण रणनीति' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Predictably Irrational by Dan Ariely",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Predictably Irrational by Dan Ariely",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Predictably Irrational by Dan Ariely",
        "explanationHi": "स्रोत: Predictably Irrational by Dan Ariely"
      },
      {
        "questionEn": "Key point 2 of 'Pricing Strategy — When and How to Raise Prices':",
        "questionHi": "'मूल्य निर्धारण रणनीति' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Annual price review: paper cost increases, GST changes, logistics costs",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Annual price review: paper cost increases, GST changes, logistics costs",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Annual price review: paper cost increases, GST changes, logistics costs",
        "explanationHi": "मुख्य बिंदु 2: Annual price review: paper cost increases, GST changes, logistics costs"
      },
      {
        "questionEn": "The final key takeaway from 'Pricing Strategy — When and How to Raise Prices' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'मूल्य निर्धारण रणनीति' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Use price increase as a reason to push customers to larger orders at old rates",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Use price increase as a reason to push customers to larger orders at old rates",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Use price increase as a reason to push customers to larger orders at old rates",
        "explanationHi": "अंतिम सीख: Use price increase as a reason to push customers to larger orders at old rates"
      }
    ]
  },
  {
    "orderIndex": 60,
    "groupNumber": 9,
    "titleEn": "The Executive Sell — Pitching to Pharma Company Decision Makers",
    "titleHi": "एग्ज़ेक्यूटिव सेल",
    "sourceBook": "The Challenger Sale",
    "difficulty": "PRO",
    "estimatedMins": 15,
    "contentEn": "This topic covers The Executive Sell — Pitching to Pharma Company Decision Makers — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Pharma companies need branded packaging for samples and giveaways\n- The executive pitch is shorter and more ROI-focused than the chemist pitch\n- Pitch to pharma: 'Branded pouches for your medical rep samples — consistent look'\n- Pharma decision cycle: 60 to 120 days — plan a longer nurture sequence\n- One pharma company account can equal 100 individual chemist accounts\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक एग्ज़ेक्यूटिव सेल को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Pharma companies need branded packaging for samples and giveaways\n- The executive pitch is shorter and more ROI-focused than the chemist pitch\n- Pitch to pharma: 'Branded pouches for your medical rep samples — consistent look'\n- Pharma decision cycle: 60 to 120 days — plan a longer nurture sequence\n- One pharma company account can equal 100 individual chemist accounts\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Executive Sell in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Pharma companies need branded packaging for samples and giveaways\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में एग्ज़ेक्यूटिव सेल लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Pharma companies need branded packaging for samples and giveaways",
    "keyPoints": [
      "Pharma companies need branded packaging for samples and giveaways",
      "The executive pitch is shorter and more ROI-focused than the chemist pitch",
      "Pitch to pharma: 'Branded pouches for your medical rep samples — consistent look'",
      "Pharma decision cycle: 60 to 120 days — plan a longer nurture sequence",
      "One pharma company account can equal 100 individual chemist accounts"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Executive Sell'?",
        "questionHi": "'एग्ज़ेक्यूटिव सेल' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Pharma companies need branded packaging for samples and giveaways",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Pharma companies need branded packaging for samples and giveaways",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Pharma companies need branded packaging for samples and giveaways",
        "explanationHi": "मुख्य सिद्धांत: Pharma companies need branded packaging for samples and giveaways"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Executive Sell' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'एग्ज़ेक्यूटिव सेल' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Executive Sell'?",
        "questionHi": "'एग्ज़ेक्यूटिव सेल' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'The Executive Sell — Pitching to Pharma Company Decision Makers':",
        "questionHi": "'एग्ज़ेक्यूटिव सेल' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "The executive pitch is shorter and more ROI-focused than the chemist pitch",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "The executive pitch is shorter and more ROI-focused than the chemist pitch",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: The executive pitch is shorter and more ROI-focused than the chemist pitch",
        "explanationHi": "मुख्य बिंदु 2: The executive pitch is shorter and more ROI-focused than the chemist pitch"
      },
      {
        "questionEn": "The final key takeaway from 'The Executive Sell — Pitching to Pharma Company Decision Makers' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'एग्ज़ेक्यूटिव सेल' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "One pharma company account can equal 100 individual chemist accounts",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "One pharma company account can equal 100 individual chemist accounts",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: One pharma company account can equal 100 individual chemist accounts",
        "explanationHi": "अंतिम सीख: One pharma company account can equal 100 individual chemist accounts"
      }
    ]
  },
  {
    "orderIndex": 61,
    "groupNumber": 10,
    "titleEn": "Reading Financial Signals from Chemists",
    "titleHi": "केमिस्ट के वित्तीय संकेत पढ़ना",
    "sourceBook": "Thinking Fast and Slow by Daniel Kahneman",
    "difficulty": "PRO",
    "estimatedMins": 13,
    "contentEn": "This topic covers Reading Financial Signals from Chemists — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Thinking Fast and Slow by Daniel Kahneman: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Store renovation signals: they have cash and care about image — prime prospect\n- New signage: they are investing in brand — perfect time to pitch pouches\n- Busy counter during visit: high footfall = high pouch usage = big potential order\n- Dusty shelves and old displays: may be cost-conscious — lead with ROI math\n- New staff uniform: growing, professional store — high quality buyer\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक केमिस्ट के वित्तीय संकेत पढ़ना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThinking Fast and Slow by Daniel Kahneman से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Store renovation signals: they have cash and care about image — prime prospect\n- New signage: they are investing in brand — perfect time to pitch pouches\n- Busy counter during visit: high footfall = high pouch usage = big potential order\n- Dusty shelves and old displays: may be cost-conscious — lead with ROI math\n- New staff uniform: growing, professional store — high quality buyer\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Reading Financial Signals from Chemists in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Store renovation signals: they have cash and care about image — prime prospect\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में केमिस्ट के वित्तीय संकेत पढ़ना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Store renovation signals: they have cash and care about image — prime prospect",
    "keyPoints": [
      "Store renovation signals: they have cash and care about image — prime prospect",
      "New signage: they are investing in brand — perfect time to pitch pouches",
      "Busy counter during visit: high footfall = high pouch usage = big potential order",
      "Dusty shelves and old displays: may be cost-conscious — lead with ROI math",
      "New staff uniform: growing, professional store — high quality buyer"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Reading Financial Signals from Chemists'?",
        "questionHi": "'केमिस्ट के वित्तीय संकेत पढ़ना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Store renovation signals: they have cash and care about image — prime prospect",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Store renovation signals: they have cash and care about image — prime prospect",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Store renovation signals: they have cash and care about image — prime prospect",
        "explanationHi": "मुख्य सिद्धांत: Store renovation signals: they have cash and care about image — prime prospect"
      },
      {
        "questionEn": "In medicine pouch sales, 'Reading Financial Signals from Chemists' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'केमिस्ट के वित्तीय संकेत पढ़ना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Reading Financial Signals from Chemists'?",
        "questionHi": "'केमिस्ट के वित्तीय संकेत पढ़ना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Thinking Fast and Slow by Daniel Kahneman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Thinking Fast and Slow by Daniel Kahneman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Thinking Fast and Slow by Daniel Kahneman",
        "explanationHi": "स्रोत: Thinking Fast and Slow by Daniel Kahneman"
      },
      {
        "questionEn": "Key point 2 of 'Reading Financial Signals from Chemists':",
        "questionHi": "'केमिस्ट के वित्तीय संकेत पढ़ना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "New signage: they are investing in brand — perfect time to pitch pouches",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "New signage: they are investing in brand — perfect time to pitch pouches",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: New signage: they are investing in brand — perfect time to pitch pouches",
        "explanationHi": "मुख्य बिंदु 2: New signage: they are investing in brand — perfect time to pitch pouches"
      },
      {
        "questionEn": "The final key takeaway from 'Reading Financial Signals from Chemists' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'केमिस्ट के वित्तीय संकेत पढ़ना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "New staff uniform: growing, professional store — high quality buyer",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "New staff uniform: growing, professional store — high quality buyer",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: New staff uniform: growing, professional store — high quality buyer",
        "explanationHi": "अंतिम सीख: New staff uniform: growing, professional store — high quality buyer"
      }
    ]
  },
  {
    "orderIndex": 62,
    "groupNumber": 10,
    "titleEn": "The Follow-Up System at Scale",
    "titleHi": "स्केल पर फॉलो-अप सिस्टम",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "PRO",
    "estimatedMins": 14,
    "contentEn": "This topic covers The Follow-Up System at Scale — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- At 200 plus active prospects, manual follow-up fails — you need a system\n- CRM or even a shared Google Sheet with follow-up dates and last contact\n- Automated WhatsApp reminders using broadcast scheduling apps\n- Monthly pipeline review: categorize every prospect by probability to close\n- Never let more than 14 days pass without touching any warm prospect\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक स्केल पर फॉलो-अप सिस्टम को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- At 200 plus active prospects, manual follow-up fails — you need a system\n- CRM or even a shared Google Sheet with follow-up dates and last contact\n- Automated WhatsApp reminders using broadcast scheduling apps\n- Monthly pipeline review: categorize every prospect by probability to close\n- Never let more than 14 days pass without touching any warm prospect\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Follow-Up System at Scale in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: At 200 plus active prospects, manual follow-up fails — you need a system\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में स्केल पर फॉलो-अप सिस्टम लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: At 200 plus active prospects, manual follow-up fails — you need a system",
    "keyPoints": [
      "At 200 plus active prospects, manual follow-up fails — you need a system",
      "CRM or even a shared Google Sheet with follow-up dates and last contact",
      "Automated WhatsApp reminders using broadcast scheduling apps",
      "Monthly pipeline review: categorize every prospect by probability to close",
      "Never let more than 14 days pass without touching any warm prospect"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Follow-Up System at Scale'?",
        "questionHi": "'स्केल पर फॉलो-अप सिस्टम' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "At 200 plus active prospects, manual follow-up fails — you need a system",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "At 200 plus active prospects, manual follow-up fails — you need a system",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: At 200 plus active prospects, manual follow-up fails — you need a system",
        "explanationHi": "मुख्य सिद्धांत: At 200 plus active prospects, manual follow-up fails — you need a system"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Follow-Up System at Scale' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'स्केल पर फॉलो-अप सिस्टम' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Follow-Up System at Scale'?",
        "questionHi": "'स्केल पर फॉलो-अप सिस्टम' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'The Follow-Up System at Scale':",
        "questionHi": "'स्केल पर फॉलो-अप सिस्टम' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "CRM or even a shared Google Sheet with follow-up dates and last contact",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "CRM or even a shared Google Sheet with follow-up dates and last contact",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: CRM or even a shared Google Sheet with follow-up dates and last contact",
        "explanationHi": "मुख्य बिंदु 2: CRM or even a shared Google Sheet with follow-up dates and last contact"
      },
      {
        "questionEn": "The final key takeaway from 'The Follow-Up System at Scale' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'स्केल पर फॉलो-अप सिस्टम' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Never let more than 14 days pass without touching any warm prospect",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Never let more than 14 days pass without touching any warm prospect",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Never let more than 14 days pass without touching any warm prospect",
        "explanationHi": "अंतिम सीख: Never let more than 14 days pass without touching any warm prospect"
      }
    ]
  },
  {
    "orderIndex": 63,
    "groupNumber": 10,
    "titleEn": "Objection: 'I Need to Talk to My Partner First'",
    "titleHi": "आपत्ति: पार्टनर से बात",
    "sourceBook": "The Challenger Sale",
    "difficulty": "PRO",
    "estimatedMins": 10,
    "contentEn": "This topic covers Objection: 'I Need to Talk to My Partner First' — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- This means there IS interest but the decision requires another person\n- Never lose momentum: 'Of course — shall I send a quick summary you can share?'\n- Create a shareable WhatsApp message they can forward to their partner\n- Offer to speak to both: 'Can we arrange a 10-minute call with both of you?'\n- After they consult: follow up within 48 hours while momentum is still alive\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक आपत्ति: पार्टनर से बात को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- This means there IS interest but the decision requires another person\n- Never lose momentum: 'Of course — shall I send a quick summary you can share?'\n- Create a shareable WhatsApp message they can forward to their partner\n- Offer to speak to both: 'Can we arrange a 10-minute call with both of you?'\n- After they consult: follow up within 48 hours while momentum is still alive\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Objection: 'I Need to Talk to My Partner First' in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: This means there IS interest but the decision requires another person\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में आपत्ति: पार्टनर से बात लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: This means there IS interest but the decision requires another person",
    "keyPoints": [
      "This means there IS interest but the decision requires another person",
      "Never lose momentum: 'Of course — shall I send a quick summary you can share?'",
      "Create a shareable WhatsApp message they can forward to their partner",
      "Offer to speak to both: 'Can we arrange a 10-minute call with both of you?'",
      "After they consult: follow up within 48 hours while momentum is still alive"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Objection: 'I Need to Talk to My Partner First''?",
        "questionHi": "'आपत्ति: पार्टनर से बात' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "This means there IS interest but the decision requires another person",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "This means there IS interest but the decision requires another person",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: This means there IS interest but the decision requires another person",
        "explanationHi": "मुख्य सिद्धांत: This means there IS interest but the decision requires another person"
      },
      {
        "questionEn": "In medicine pouch sales, 'Objection: 'I Need to Talk to My Partner First'' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: पार्टनर से बात' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Objection: 'I Need to Talk to My Partner First''?",
        "questionHi": "'आपत्ति: पार्टनर से बात' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'Objection: 'I Need to Talk to My Partner First'':",
        "questionHi": "'आपत्ति: पार्टनर से बात' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Never lose momentum: 'Of course — shall I send a quick summary you can share?'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Never lose momentum: 'Of course — shall I send a quick summary you can share?'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Never lose momentum: 'Of course — shall I send a quick summary you can share?'",
        "explanationHi": "मुख्य बिंदु 2: Never lose momentum: 'Of course — shall I send a quick summary you can share?'"
      },
      {
        "questionEn": "The final key takeaway from 'Objection: 'I Need to Talk to My Partner First'' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'आपत्ति: पार्टनर से बात' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "After they consult: follow up within 48 hours while momentum is still alive",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "After they consult: follow up within 48 hours while momentum is still alive",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: After they consult: follow up within 48 hours while momentum is still alive",
        "explanationHi": "अंतिम सीख: After they consult: follow up within 48 hours while momentum is still alive"
      }
    ]
  },
  {
    "orderIndex": 64,
    "groupNumber": 10,
    "titleEn": "The Premium Positioning Strategy",
    "titleHi": "प्रीमियम पोज़िशनिंग",
    "sourceBook": "Influence by Robert Cialdini",
    "difficulty": "PRO",
    "estimatedMins": 13,
    "contentEn": "This topic covers The Premium Positioning Strategy — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Influence by Robert Cialdini: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Premium positioning means never competing on price — always on value\n- Signal quality: use of premium terminology, professional design proofs\n- Never apologize for your price — own it with confidence and specific reasoning\n- Premium customers are loyal and refer premium customers — the cycle compounds\n- Price cutting attracts price buyers who switch the moment someone cheaper appears\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक प्रीमियम पोज़िशनिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nInfluence by Robert Cialdini से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Premium positioning means never competing on price — always on value\n- Signal quality: use of premium terminology, professional design proofs\n- Never apologize for your price — own it with confidence and specific reasoning\n- Premium customers are loyal and refer premium customers — the cycle compounds\n- Price cutting attracts price buyers who switch the moment someone cheaper appears\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Premium Positioning Strategy in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Premium positioning means never competing on price — always on value\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में प्रीमियम पोज़िशनिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Premium positioning means never competing on price — always on value",
    "keyPoints": [
      "Premium positioning means never competing on price — always on value",
      "Signal quality: use of premium terminology, professional design proofs",
      "Never apologize for your price — own it with confidence and specific reasoning",
      "Premium customers are loyal and refer premium customers — the cycle compounds",
      "Price cutting attracts price buyers who switch the moment someone cheaper appears"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Premium Positioning Strategy'?",
        "questionHi": "'प्रीमियम पोज़िशनिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Premium positioning means never competing on price — always on value",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Premium positioning means never competing on price — always on value",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Premium positioning means never competing on price — always on value",
        "explanationHi": "मुख्य सिद्धांत: Premium positioning means never competing on price — always on value"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Premium Positioning Strategy' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'प्रीमियम पोज़िशनिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Premium Positioning Strategy'?",
        "questionHi": "'प्रीमियम पोज़िशनिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Influence by Robert Cialdini",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Influence by Robert Cialdini",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Influence by Robert Cialdini",
        "explanationHi": "स्रोत: Influence by Robert Cialdini"
      },
      {
        "questionEn": "Key point 2 of 'The Premium Positioning Strategy':",
        "questionHi": "'प्रीमियम पोज़िशनिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Signal quality: use of premium terminology, professional design proofs",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Signal quality: use of premium terminology, professional design proofs",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Signal quality: use of premium terminology, professional design proofs",
        "explanationHi": "मुख्य बिंदु 2: Signal quality: use of premium terminology, professional design proofs"
      },
      {
        "questionEn": "The final key takeaway from 'The Premium Positioning Strategy' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'प्रीमियम पोज़िशनिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Price cutting attracts price buyers who switch the moment someone cheaper appears",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Price cutting attracts price buyers who switch the moment someone cheaper appears",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Price cutting attracts price buyers who switch the moment someone cheaper appears",
        "explanationHi": "अंतिम सीख: Price cutting attracts price buyers who switch the moment someone cheaper appears"
      }
    ]
  },
  {
    "orderIndex": 65,
    "groupNumber": 10,
    "titleEn": "Geographic Expansion — Entering New Markets",
    "titleHi": "भौगोलिक विस्तार",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "PRO",
    "estimatedMins": 14,
    "contentEn": "This topic covers Geographic Expansion — Entering New Markets — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Before entering a new city: research local market norms and language\n- Start with 20 to 30 warm introduction calls via existing network in that city\n- Local reference store: secure one anchor customer before mass prospecting\n- Adapt language and approach: Gujarati market is different from Maharashtra\n- Track new market performance separately for 3 months before scaling\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक भौगोलिक विस्तार को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Before entering a new city: research local market norms and language\n- Start with 20 to 30 warm introduction calls via existing network in that city\n- Local reference store: secure one anchor customer before mass prospecting\n- Adapt language and approach: Gujarati market is different from Maharashtra\n- Track new market performance separately for 3 months before scaling\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Geographic Expansion in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Before entering a new city: research local market norms and language\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में भौगोलिक विस्तार लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Before entering a new city: research local market norms and language",
    "keyPoints": [
      "Before entering a new city: research local market norms and language",
      "Start with 20 to 30 warm introduction calls via existing network in that city",
      "Local reference store: secure one anchor customer before mass prospecting",
      "Adapt language and approach: Gujarati market is different from Maharashtra",
      "Track new market performance separately for 3 months before scaling"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Geographic Expansion'?",
        "questionHi": "'भौगोलिक विस्तार' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Before entering a new city: research local market norms and language",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Before entering a new city: research local market norms and language",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Before entering a new city: research local market norms and language",
        "explanationHi": "मुख्य सिद्धांत: Before entering a new city: research local market norms and language"
      },
      {
        "questionEn": "In medicine pouch sales, 'Geographic Expansion' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'भौगोलिक विस्तार' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Geographic Expansion'?",
        "questionHi": "'भौगोलिक विस्तार' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'Geographic Expansion — Entering New Markets':",
        "questionHi": "'भौगोलिक विस्तार' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Start with 20 to 30 warm introduction calls via existing network in that city",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Start with 20 to 30 warm introduction calls via existing network in that city",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Start with 20 to 30 warm introduction calls via existing network in that city",
        "explanationHi": "मुख्य बिंदु 2: Start with 20 to 30 warm introduction calls via existing network in that city"
      },
      {
        "questionEn": "The final key takeaway from 'Geographic Expansion — Entering New Markets' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'भौगोलिक विस्तार' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Track new market performance separately for 3 months before scaling",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Track new market performance separately for 3 months before scaling",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Track new market performance separately for 3 months before scaling",
        "explanationHi": "अंतिम सीख: Track new market performance separately for 3 months before scaling"
      }
    ]
  },
  {
    "orderIndex": 66,
    "groupNumber": 10,
    "titleEn": "The Long Game — Building Lifetime Customer Value",
    "titleHi": "दीर्घकालिक खेल — आजीवन ग्राहक मूल्य",
    "sourceBook": "The Trusted Advisor by David Maister",
    "difficulty": "PRO",
    "estimatedMins": 15,
    "contentEn": "This topic covers The Long Game — Building Lifetime Customer Value — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Trusted Advisor by David Maister: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Lifetime value of a chemist: average order value times number of reorders per year\n- A store ordering 5000 pieces every 5 months = 2.4 orders per year = lifetime revenue\n- Retention is 5x cheaper than acquisition — protect existing accounts fiercely\n- Annual relationship call: 'How can we serve you better this year?' builds loyalty\n- Top 20 percent customers generate 80 percent of revenue — know who they are\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक दीर्घकालिक खेल — आजीवन ग्राहक मूल्य को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Trusted Advisor by David Maister से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Lifetime value of a chemist: average order value times number of reorders per year\n- A store ordering 5000 pieces every 5 months = 2.4 orders per year = lifetime revenue\n- Retention is 5x cheaper than acquisition — protect existing accounts fiercely\n- Annual relationship call: 'How can we serve you better this year?' builds loyalty\n- Top 20 percent customers generate 80 percent of revenue — know who they are\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Long Game in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Lifetime value of a chemist: average order value times number of reorders per year\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में दीर्घकालिक खेल लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Lifetime value of a chemist: average order value times number of reorders per year",
    "keyPoints": [
      "Lifetime value of a chemist: average order value times number of reorders per year",
      "A store ordering 5000 pieces every 5 months = 2.4 orders per year = lifetime revenue",
      "Retention is 5x cheaper than acquisition — protect existing accounts fiercely",
      "Annual relationship call: 'How can we serve you better this year?' builds loyalty",
      "Top 20 percent customers generate 80 percent of revenue — know who they are"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Long Game'?",
        "questionHi": "'दीर्घकालिक खेल' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Lifetime value of a chemist: average order value times number of reorders per year",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Lifetime value of a chemist: average order value times number of reorders per year",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Lifetime value of a chemist: average order value times number of reorders per year",
        "explanationHi": "मुख्य सिद्धांत: Lifetime value of a chemist: average order value times number of reorders per year"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Long Game' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'दीर्घकालिक खेल' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Long Game'?",
        "questionHi": "'दीर्घकालिक खेल' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Trusted Advisor by David Maister",
        "explanationHi": "स्रोत: The Trusted Advisor by David Maister"
      },
      {
        "questionEn": "Key point 2 of 'The Long Game — Building Lifetime Customer Value':",
        "questionHi": "'दीर्घकालिक खेल — आजीवन ग्राहक मूल्य' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "A store ordering 5000 pieces every 5 months = 2.4 orders per year = lifetime revenue",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "A store ordering 5000 pieces every 5 months = 2.4 orders per year = lifetime revenue",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: A store ordering 5000 pieces every 5 months = 2.4 orders per year = lifetime revenue",
        "explanationHi": "मुख्य बिंदु 2: A store ordering 5000 pieces every 5 months = 2.4 orders per year = lifetime revenue"
      },
      {
        "questionEn": "The final key takeaway from 'The Long Game — Building Lifetime Customer Value' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'दीर्घकालिक खेल — आजीवन ग्राहक मूल्य' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Top 20 percent customers generate 80 percent of revenue — know who they are",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Top 20 percent customers generate 80 percent of revenue — know who they are",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Top 20 percent customers generate 80 percent of revenue — know who they are",
        "explanationHi": "अंतिम सीख: Top 20 percent customers generate 80 percent of revenue — know who they are"
      }
    ]
  },
  {
    "orderIndex": 67,
    "groupNumber": 10,
    "titleEn": "Handling 'We Are Going with Someone Else'",
    "titleHi": "'हम किसी और के साथ जा रहे हैं' संभालना",
    "sourceBook": "Never Split the Difference by Chris Voss",
    "difficulty": "PRO",
    "estimatedMins": 11,
    "contentEn": "This topic covers Handling 'We Are Going with Someone Else' — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Never Split the Difference by Chris Voss: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- This is not a final no unless the cheque has been written\n- Ask: 'May I ask who you chose and what made the difference?' — learn from it\n- Graceful exit: 'I respect that completely. May I stay in touch for future needs?'\n- Re-entry: follow up in 60 days — the other vendor may have disappointed by then\n- Lost deals often convert 3 to 6 months later if you stay professional\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक 'हम किसी और के साथ जा रहे हैं' संभालना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nNever Split the Difference by Chris Voss से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- This is not a final no unless the cheque has been written\n- Ask: 'May I ask who you chose and what made the difference?' — learn from it\n- Graceful exit: 'I respect that completely. May I stay in touch for future needs?'\n- Re-entry: follow up in 60 days — the other vendor may have disappointed by then\n- Lost deals often convert 3 to 6 months later if you stay professional\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Handling 'We Are Going with Someone Else' in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: This is not a final no unless the cheque has been written\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में 'हम किसी और के साथ जा रहे हैं' संभालना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: This is not a final no unless the cheque has been written",
    "keyPoints": [
      "This is not a final no unless the cheque has been written",
      "Ask: 'May I ask who you chose and what made the difference?' — learn from it",
      "Graceful exit: 'I respect that completely. May I stay in touch for future needs?'",
      "Re-entry: follow up in 60 days — the other vendor may have disappointed by then",
      "Lost deals often convert 3 to 6 months later if you stay professional"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Handling 'We Are Going with Someone Else''?",
        "questionHi": "''हम किसी और के साथ जा रहे हैं' संभालना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "This is not a final no unless the cheque has been written",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "This is not a final no unless the cheque has been written",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: This is not a final no unless the cheque has been written",
        "explanationHi": "मुख्य सिद्धांत: This is not a final no unless the cheque has been written"
      },
      {
        "questionEn": "In medicine pouch sales, 'Handling 'We Are Going with Someone Else'' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में ''हम किसी और के साथ जा रहे हैं' संभालना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Handling 'We Are Going with Someone Else''?",
        "questionHi": "''हम किसी और के साथ जा रहे हैं' संभालना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Never Split the Difference by Chris Voss",
        "explanationHi": "स्रोत: Never Split the Difference by Chris Voss"
      },
      {
        "questionEn": "Key point 2 of 'Handling 'We Are Going with Someone Else'':",
        "questionHi": "''हम किसी और के साथ जा रहे हैं' संभालना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Ask: 'May I ask who you chose and what made the difference?' — learn from it",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Ask: 'May I ask who you chose and what made the difference?' — learn from it",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Ask: 'May I ask who you chose and what made the difference?' — learn from it",
        "explanationHi": "मुख्य बिंदु 2: Ask: 'May I ask who you chose and what made the difference?' — learn from it"
      },
      {
        "questionEn": "The final key takeaway from 'Handling 'We Are Going with Someone Else'' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए ''हम किसी और के साथ जा रहे हैं' संभालना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Lost deals often convert 3 to 6 months later if you stay professional",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Lost deals often convert 3 to 6 months later if you stay professional",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Lost deals often convert 3 to 6 months later if you stay professional",
        "explanationHi": "अंतिम सीख: Lost deals often convert 3 to 6 months later if you stay professional"
      }
    ]
  },
  {
    "orderIndex": 68,
    "groupNumber": 10,
    "titleEn": "Pitch Personalization at Scale",
    "titleHi": "स्केल पर पिच व्यक्तिगतकरण",
    "sourceBook": "To Sell is Human by Daniel Pink",
    "difficulty": "PRO",
    "estimatedMins": 14,
    "contentEn": "This topic covers Pitch Personalization at Scale — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from To Sell is Human by Daniel Pink: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Personalization at scale means having multiple pitch variants for customer types\n- Urban high-footfall store pitch: focus on patient retention and differentiation\n- Rural semi-urban store pitch: focus on professional image and trust signals\n- Franchise or chain pitch: focus on brand consistency and bulk order economics\n- Hospital pharmacy pitch: focus on institutional credibility and volume efficiency\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक स्केल पर पिच व्यक्तिगतकरण को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nTo Sell is Human by Daniel Pink से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Personalization at scale means having multiple pitch variants for customer types\n- Urban high-footfall store pitch: focus on patient retention and differentiation\n- Rural semi-urban store pitch: focus on professional image and trust signals\n- Franchise or chain pitch: focus on brand consistency and bulk order economics\n- Hospital pharmacy pitch: focus on institutional credibility and volume efficiency\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Pitch Personalization at Scale in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Personalization at scale means having multiple pitch variants for customer types\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में स्केल पर पिच व्यक्तिगतकरण लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Personalization at scale means having multiple pitch variants for customer types",
    "keyPoints": [
      "Personalization at scale means having multiple pitch variants for customer types",
      "Urban high-footfall store pitch: focus on patient retention and differentiation",
      "Rural semi-urban store pitch: focus on professional image and trust signals",
      "Franchise or chain pitch: focus on brand consistency and bulk order economics",
      "Hospital pharmacy pitch: focus on institutional credibility and volume efficiency"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Pitch Personalization at Scale'?",
        "questionHi": "'स्केल पर पिच व्यक्तिगतकरण' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Personalization at scale means having multiple pitch variants for customer types",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Personalization at scale means having multiple pitch variants for customer types",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Personalization at scale means having multiple pitch variants for customer types",
        "explanationHi": "मुख्य सिद्धांत: Personalization at scale means having multiple pitch variants for customer types"
      },
      {
        "questionEn": "In medicine pouch sales, 'Pitch Personalization at Scale' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'स्केल पर पिच व्यक्तिगतकरण' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Pitch Personalization at Scale'?",
        "questionHi": "'स्केल पर पिच व्यक्तिगतकरण' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "To Sell is Human by Daniel Pink",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "To Sell is Human by Daniel Pink",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: To Sell is Human by Daniel Pink",
        "explanationHi": "स्रोत: To Sell is Human by Daniel Pink"
      },
      {
        "questionEn": "Key point 2 of 'Pitch Personalization at Scale':",
        "questionHi": "'स्केल पर पिच व्यक्तिगतकरण' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Urban high-footfall store pitch: focus on patient retention and differentiation",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Urban high-footfall store pitch: focus on patient retention and differentiation",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Urban high-footfall store pitch: focus on patient retention and differentiation",
        "explanationHi": "मुख्य बिंदु 2: Urban high-footfall store pitch: focus on patient retention and differentiation"
      },
      {
        "questionEn": "The final key takeaway from 'Pitch Personalization at Scale' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'स्केल पर पिच व्यक्तिगतकरण' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Hospital pharmacy pitch: focus on institutional credibility and volume efficiency",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Hospital pharmacy pitch: focus on institutional credibility and volume efficiency",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Hospital pharmacy pitch: focus on institutional credibility and volume efficiency",
        "explanationHi": "अंतिम सीख: Hospital pharmacy pitch: focus on institutional credibility and volume efficiency"
      }
    ]
  },
  {
    "orderIndex": 69,
    "groupNumber": 10,
    "titleEn": "Mindset of a Million-Rupee Salesperson",
    "titleHi": "करोड़पति सेल्सपर्सन की मानसिकता",
    "sourceBook": "Psychology of Selling by Brian Tracy",
    "difficulty": "PRO",
    "estimatedMins": 15,
    "contentEn": "This topic covers Mindset of a Million-Rupee Salesperson — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Psychology of Selling by Brian Tracy: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Top 1 percent salespeople think in annual targets not daily call counts\n- Break your annual revenue goal into monthly, weekly, and daily sales activities\n- Identity shift: 'I am a trusted advisor to pharmacy owners' not 'I am a caller'\n- Growth mindset: every skill in this course is learnable — start with one today\n- Compound effect: 1 percent improvement daily equals 37x better in one year\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक करोड़पति सेल्सपर्सन की मानसिकता को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nPsychology of Selling by Brian Tracy से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Top 1 percent salespeople think in annual targets not daily call counts\n- Break your annual revenue goal into monthly, weekly, and daily sales activities\n- Identity shift: 'I am a trusted advisor to pharmacy owners' not 'I am a caller'\n- Growth mindset: every skill in this course is learnable — start with one today\n- Compound effect: 1 percent improvement daily equals 37x better in one year\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Mindset of a Million-Rupee Salesperson in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Top 1 percent salespeople think in annual targets not daily call counts\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में करोड़पति सेल्सपर्सन की मानसिकता लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Top 1 percent salespeople think in annual targets not daily call counts",
    "keyPoints": [
      "Top 1 percent salespeople think in annual targets not daily call counts",
      "Break your annual revenue goal into monthly, weekly, and daily sales activities",
      "Identity shift: 'I am a trusted advisor to pharmacy owners' not 'I am a caller'",
      "Growth mindset: every skill in this course is learnable — start with one today",
      "Compound effect: 1 percent improvement daily equals 37x better in one year"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Mindset of a Million-Rupee Salesperson'?",
        "questionHi": "'करोड़पति सेल्सपर्सन की मानसिकता' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Top 1 percent salespeople think in annual targets not daily call counts",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Top 1 percent salespeople think in annual targets not daily call counts",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Top 1 percent salespeople think in annual targets not daily call counts",
        "explanationHi": "मुख्य सिद्धांत: Top 1 percent salespeople think in annual targets not daily call counts"
      },
      {
        "questionEn": "In medicine pouch sales, 'Mindset of a Million-Rupee Salesperson' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'करोड़पति सेल्सपर्सन की मानसिकता' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Mindset of a Million-Rupee Salesperson'?",
        "questionHi": "'करोड़पति सेल्सपर्सन की मानसिकता' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Psychology of Selling by Brian Tracy",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Psychology of Selling by Brian Tracy",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Psychology of Selling by Brian Tracy",
        "explanationHi": "स्रोत: Psychology of Selling by Brian Tracy"
      },
      {
        "questionEn": "Key point 2 of 'Mindset of a Million-Rupee Salesperson':",
        "questionHi": "'करोड़पति सेल्सपर्सन की मानसिकता' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Break your annual revenue goal into monthly, weekly, and daily sales activities",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Break your annual revenue goal into monthly, weekly, and daily sales activities",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Break your annual revenue goal into monthly, weekly, and daily sales activities",
        "explanationHi": "मुख्य बिंदु 2: Break your annual revenue goal into monthly, weekly, and daily sales activities"
      },
      {
        "questionEn": "The final key takeaway from 'Mindset of a Million-Rupee Salesperson' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'करोड़पति सेल्सपर्सन की मानसिकता' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Compound effect: 1 percent improvement daily equals 37x better in one year",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Compound effect: 1 percent improvement daily equals 37x better in one year",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Compound effect: 1 percent improvement daily equals 37x better in one year",
        "explanationHi": "अंतिम सीख: Compound effect: 1 percent improvement daily equals 37x better in one year"
      }
    ]
  },
  {
    "orderIndex": 70,
    "groupNumber": 10,
    "titleEn": "Building Your Personal Sales Brand",
    "titleHi": "व्यक्तिगत सेल्स ब्रांड बनाना",
    "sourceBook": "To Sell is Human by Daniel Pink",
    "difficulty": "PRO",
    "estimatedMins": 13,
    "contentEn": "This topic covers Building Your Personal Sales Brand — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from To Sell is Human by Daniel Pink: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Your personal brand is your reputation — what chemists say when you are not there\n- Consistency is the foundation of personal brand: always call when you say you will\n- Share valuable content: a monthly WhatsApp message with a pharmacy business tip\n- Referral strength comes from personal brand — people refer people they trust\n- Your personal brand outlasts any product — it travels with you throughout your career\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक व्यक्तिगत सेल्स ब्रांड बनाना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nTo Sell is Human by Daniel Pink से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Your personal brand is your reputation — what chemists say when you are not there\n- Consistency is the foundation of personal brand: always call when you say you will\n- Share valuable content: a monthly WhatsApp message with a pharmacy business tip\n- Referral strength comes from personal brand — people refer people they trust\n- Your personal brand outlasts any product — it travels with you throughout your career\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Building Your Personal Sales Brand in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Your personal brand is your reputation — what chemists say when you are not there\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में व्यक्तिगत सेल्स ब्रांड बनाना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Your personal brand is your reputation — what chemists say when you are not there",
    "keyPoints": [
      "Your personal brand is your reputation — what chemists say when you are not there",
      "Consistency is the foundation of personal brand: always call when you say you will",
      "Share valuable content: a monthly WhatsApp message with a pharmacy business tip",
      "Referral strength comes from personal brand — people refer people they trust",
      "Your personal brand outlasts any product — it travels with you throughout your career"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Building Your Personal Sales Brand'?",
        "questionHi": "'व्यक्तिगत सेल्स ब्रांड बनाना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Your personal brand is your reputation — what chemists say when you are not there",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Your personal brand is your reputation — what chemists say when you are not there",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Your personal brand is your reputation — what chemists say when you are not there",
        "explanationHi": "मुख्य सिद्धांत: Your personal brand is your reputation — what chemists say when you are not there"
      },
      {
        "questionEn": "In medicine pouch sales, 'Building Your Personal Sales Brand' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'व्यक्तिगत सेल्स ब्रांड बनाना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Building Your Personal Sales Brand'?",
        "questionHi": "'व्यक्तिगत सेल्स ब्रांड बनाना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "To Sell is Human by Daniel Pink",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "To Sell is Human by Daniel Pink",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: To Sell is Human by Daniel Pink",
        "explanationHi": "स्रोत: To Sell is Human by Daniel Pink"
      },
      {
        "questionEn": "Key point 2 of 'Building Your Personal Sales Brand':",
        "questionHi": "'व्यक्तिगत सेल्स ब्रांड बनाना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Consistency is the foundation of personal brand: always call when you say you will",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Consistency is the foundation of personal brand: always call when you say you will",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Consistency is the foundation of personal brand: always call when you say you will",
        "explanationHi": "मुख्य बिंदु 2: Consistency is the foundation of personal brand: always call when you say you will"
      },
      {
        "questionEn": "The final key takeaway from 'Building Your Personal Sales Brand' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'व्यक्तिगत सेल्स ब्रांड बनाना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Your personal brand outlasts any product — it travels with you throughout your career",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Your personal brand outlasts any product — it travels with you throughout your career",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Your personal brand outlasts any product — it travels with you throughout your career",
        "explanationHi": "अंतिम सीख: Your personal brand outlasts any product — it travels with you throughout your career"
      }
    ]
  },
  {
    "orderIndex": 71,
    "groupNumber": 11,
    "titleEn": "Advanced SPIN Selling for Medicine Pouches",
    "titleHi": "उन्नत SPIN सेलिंग",
    "sourceBook": "SPIN Selling by Neil Rackham",
    "difficulty": "PRO",
    "estimatedMins": 15,
    "contentEn": "This topic covers Advanced SPIN Selling for Medicine Pouches — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from SPIN Selling by Neil Rackham: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- SPIN: Situation, Problem, Implication, Need-Payoff questions in sequence\n- Situation: 'How many patients do you serve daily? What are you using for packaging?'\n- Problem: 'Does the plain packaging limit your ability to stand out from competitors?'\n- Implication: 'If patients do not remember your name, what happens to referrals?'\n- Need-Payoff: 'If branded packaging solved the referral problem, what would that mean for you?'\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक उन्नत SPIN सेलिंग को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nSPIN Selling by Neil Rackham से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- SPIN: Situation, Problem, Implication, Need-Payoff questions in sequence\n- Situation: 'How many patients do you serve daily? What are you using for packaging?'\n- Problem: 'Does the plain packaging limit your ability to stand out from competitors?'\n- Implication: 'If patients do not remember your name, what happens to referrals?'\n- Need-Payoff: 'If branded packaging solved the referral problem, what would that mean for you?'\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Advanced SPIN Selling for Medicine Pouches in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: SPIN: Situation, Problem, Implication, Need-Payoff questions in sequence\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में उन्नत SPIN सेलिंग लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: SPIN: Situation, Problem, Implication, Need-Payoff questions in sequence",
    "keyPoints": [
      "SPIN: Situation, Problem, Implication, Need-Payoff questions in sequence",
      "Situation: 'How many patients do you serve daily? What are you using for packaging?'",
      "Problem: 'Does the plain packaging limit your ability to stand out from competitors?'",
      "Implication: 'If patients do not remember your name, what happens to referrals?'",
      "Need-Payoff: 'If branded packaging solved the referral problem, what would that mean for you?'"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Advanced SPIN Selling for Medicine Pouches'?",
        "questionHi": "'उन्नत SPIN सेलिंग' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "SPIN: Situation, Problem, Implication, Need-Payoff questions in sequence",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "SPIN: Situation, Problem, Implication, Need-Payoff questions in sequence",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: SPIN: Situation, Problem, Implication, Need-Payoff questions in sequence",
        "explanationHi": "मुख्य सिद्धांत: SPIN: Situation, Problem, Implication, Need-Payoff questions in sequence"
      },
      {
        "questionEn": "In medicine pouch sales, 'Advanced SPIN Selling for Medicine Pouches' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'उन्नत SPIN सेलिंग' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Advanced SPIN Selling for Medicine Pouches'?",
        "questionHi": "'उन्नत SPIN सेलिंग' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "SPIN Selling by Neil Rackham",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "SPIN Selling by Neil Rackham",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: SPIN Selling by Neil Rackham",
        "explanationHi": "स्रोत: SPIN Selling by Neil Rackham"
      },
      {
        "questionEn": "Key point 2 of 'Advanced SPIN Selling for Medicine Pouches':",
        "questionHi": "'उन्नत SPIN सेलिंग' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Situation: 'How many patients do you serve daily? What are you using for packaging?'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Situation: 'How many patients do you serve daily? What are you using for packaging?'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Situation: 'How many patients do you serve daily? What are you using for packaging?'",
        "explanationHi": "मुख्य बिंदु 2: Situation: 'How many patients do you serve daily? What are you using for packaging?'"
      },
      {
        "questionEn": "The final key takeaway from 'Advanced SPIN Selling for Medicine Pouches' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'उन्नत SPIN सेलिंग' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Need-Payoff: 'If branded packaging solved the referral problem, what would that mean for you?'",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Need-Payoff: 'If branded packaging solved the referral problem, what would that mean for you?'",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Need-Payoff: 'If branded packaging solved the referral problem, what would that mean for you?'",
        "explanationHi": "अंतिम सीख: Need-Payoff: 'If branded packaging solved the referral problem, what would that mean for you?'"
      }
    ]
  },
  {
    "orderIndex": 72,
    "groupNumber": 11,
    "titleEn": "Objection: 'I Do Not Have Space to Store 5000 Pieces'",
    "titleHi": "आपत्ति: स्टोरेज की जगह नहीं",
    "sourceBook": "Sell or Be Sold by Grant Cardone",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 8,
    "contentEn": "This topic covers Objection: 'I Do Not Have Space to Store 5000 Pieces' — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Sell or Be Sold by Grant Cardone: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- 5000 pouches flat-packed take roughly the space of a thick magazine stack\n- Calculate actual volume: 5000 4x5 pouches stacked equals approximately 30cm height\n- Storage solution: 'One shelf corner in your back room handles the entire batch'\n- Use this objection as a buying signal — they are thinking about logistics not rejection\n- Offer to deliver in two batches of 2500 if storage is genuinely limited\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक आपत्ति: स्टोरेज की जगह नहीं को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nSell or Be Sold by Grant Cardone से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- 5000 pouches flat-packed take roughly the space of a thick magazine stack\n- Calculate actual volume: 5000 4x5 pouches stacked equals approximately 30cm height\n- Storage solution: 'One shelf corner in your back room handles the entire batch'\n- Use this objection as a buying signal — they are thinking about logistics not rejection\n- Offer to deliver in two batches of 2500 if storage is genuinely limited\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Objection: 'I Do Not Have Space to Store 5000 Pieces' in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: 5000 pouches flat-packed take roughly the space of a thick magazine stack\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में आपत्ति: स्टोरेज की जगह नहीं लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: 5000 pouches flat-packed take roughly the space of a thick magazine stack",
    "keyPoints": [
      "5000 pouches flat-packed take roughly the space of a thick magazine stack",
      "Calculate actual volume: 5000 4x5 pouches stacked equals approximately 30cm height",
      "Storage solution: 'One shelf corner in your back room handles the entire batch'",
      "Use this objection as a buying signal — they are thinking about logistics not rejection",
      "Offer to deliver in two batches of 2500 if storage is genuinely limited"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Objection: 'I Do Not Have Space to Store 5000 Pieces''?",
        "questionHi": "'आपत्ति: स्टोरेज की जगह नहीं' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "5000 pouches flat-packed take roughly the space of a thick magazine stack",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "5000 pouches flat-packed take roughly the space of a thick magazine stack",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: 5000 pouches flat-packed take roughly the space of a thick magazine stack",
        "explanationHi": "मुख्य सिद्धांत: 5000 pouches flat-packed take roughly the space of a thick magazine stack"
      },
      {
        "questionEn": "In medicine pouch sales, 'Objection: 'I Do Not Have Space to Store 5000 Pieces'' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: स्टोरेज की जगह नहीं' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Objection: 'I Do Not Have Space to Store 5000 Pieces''?",
        "questionHi": "'आपत्ति: स्टोरेज की जगह नहीं' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Sell or Be Sold by Grant Cardone",
        "explanationHi": "स्रोत: Sell or Be Sold by Grant Cardone"
      },
      {
        "questionEn": "Key point 2 of 'Objection: 'I Do Not Have Space to Store 5000 Pieces'':",
        "questionHi": "'आपत्ति: स्टोरेज की जगह नहीं' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Calculate actual volume: 5000 4x5 pouches stacked equals approximately 30cm height",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Calculate actual volume: 5000 4x5 pouches stacked equals approximately 30cm height",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Calculate actual volume: 5000 4x5 pouches stacked equals approximately 30cm height",
        "explanationHi": "मुख्य बिंदु 2: Calculate actual volume: 5000 4x5 pouches stacked equals approximately 30cm height"
      },
      {
        "questionEn": "The final key takeaway from 'Objection: 'I Do Not Have Space to Store 5000 Pieces'' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'आपत्ति: स्टोरेज की जगह नहीं' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Offer to deliver in two batches of 2500 if storage is genuinely limited",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Offer to deliver in two batches of 2500 if storage is genuinely limited",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Offer to deliver in two batches of 2500 if storage is genuinely limited",
        "explanationHi": "अंतिम सीख: Offer to deliver in two batches of 2500 if storage is genuinely limited"
      }
    ]
  },
  {
    "orderIndex": 73,
    "groupNumber": 11,
    "titleEn": "Objection: 'We Are Not in a Position to Invest Right Now'",
    "titleHi": "आपत्ति: अभी निवेश की स्थिति नहीं",
    "sourceBook": "Never Split the Difference by Chris Voss",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "This topic covers Objection: 'We Are Not in a Position to Invest Right Now' — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Never Split the Difference by Chris Voss: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- This objection often means cash flow concern not genuine inability to buy\n- Ask: 'When would be a better time — one month from now or three months?'\n- COD structure: 50 percent upfront means only Rs 7500 today for a full order\n- Break it to daily investment: Rs 41 per day for 365 days of patient branding\n- Offer to start smaller: if they cannot do 5000, explore if they can take 2500 plus later\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक आपत्ति: अभी निवेश की स्थिति नहीं को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nNever Split the Difference by Chris Voss से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- This objection often means cash flow concern not genuine inability to buy\n- Ask: 'When would be a better time — one month from now or three months?'\n- COD structure: 50 percent upfront means only Rs 7500 today for a full order\n- Break it to daily investment: Rs 41 per day for 365 days of patient branding\n- Offer to start smaller: if they cannot do 5000, explore if they can take 2500 plus later\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Objection: 'We Are Not in a Position to Invest Right Now' in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: This objection often means cash flow concern not genuine inability to buy\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में आपत्ति: अभी निवेश की स्थिति नहीं लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: This objection often means cash flow concern not genuine inability to buy",
    "keyPoints": [
      "This objection often means cash flow concern not genuine inability to buy",
      "Ask: 'When would be a better time — one month from now or three months?'",
      "COD structure: 50 percent upfront means only Rs 7500 today for a full order",
      "Break it to daily investment: Rs 41 per day for 365 days of patient branding",
      "Offer to start smaller: if they cannot do 5000, explore if they can take 2500 plus later"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Objection: 'We Are Not in a Position to Invest Right Now''?",
        "questionHi": "'आपत्ति: अभी निवेश की स्थिति नहीं' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "This objection often means cash flow concern not genuine inability to buy",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "This objection often means cash flow concern not genuine inability to buy",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: This objection often means cash flow concern not genuine inability to buy",
        "explanationHi": "मुख्य सिद्धांत: This objection often means cash flow concern not genuine inability to buy"
      },
      {
        "questionEn": "In medicine pouch sales, 'Objection: 'We Are Not in a Position to Invest Right Now'' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: अभी निवेश की स्थिति नहीं' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Objection: 'We Are Not in a Position to Invest Right Now''?",
        "questionHi": "'आपत्ति: अभी निवेश की स्थिति नहीं' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Never Split the Difference by Chris Voss",
        "explanationHi": "स्रोत: Never Split the Difference by Chris Voss"
      },
      {
        "questionEn": "Key point 2 of 'Objection: 'We Are Not in a Position to Invest Right Now'':",
        "questionHi": "'आपत्ति: अभी निवेश की स्थिति नहीं' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Ask: 'When would be a better time — one month from now or three months?'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Ask: 'When would be a better time — one month from now or three months?'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Ask: 'When would be a better time — one month from now or three months?'",
        "explanationHi": "मुख्य बिंदु 2: Ask: 'When would be a better time — one month from now or three months?'"
      },
      {
        "questionEn": "The final key takeaway from 'Objection: 'We Are Not in a Position to Invest Right Now'' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'आपत्ति: अभी निवेश की स्थिति नहीं' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Offer to start smaller: if they cannot do 5000, explore if they can take 2500 plus later",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Offer to start smaller: if they cannot do 5000, explore if they can take 2500 plus later",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Offer to start smaller: if they cannot do 5000, explore if they can take 2500 plus later",
        "explanationHi": "अंतिम सीख: Offer to start smaller: if they cannot do 5000, explore if they can take 2500 plus later"
      }
    ]
  },
  {
    "orderIndex": 74,
    "groupNumber": 11,
    "titleEn": "Using Testimonials and Case Studies Strategically",
    "titleHi": "प्रशंसापत्र और केस स्टडी",
    "sourceBook": "Influence by Robert Cialdini",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 10,
    "contentEn": "This topic covers Using Testimonials and Case Studies Strategically — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Influence by Robert Cialdini: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- A testimonial from a similar store is 10x more persuasive than your own claim\n- Collect testimonials: call satisfied customers and ask for a 30-second voice note\n- Use case studies: 'A pharmacy in Nashik with 70 patients per day saw this result'\n- Match the testimonial to the prospect: same city, same size, same concern addressed\n- WhatsApp testimonial messages: save best ones and share at the right moment\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक प्रशंसापत्र और केस स्टडी को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nInfluence by Robert Cialdini से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- A testimonial from a similar store is 10x more persuasive than your own claim\n- Collect testimonials: call satisfied customers and ask for a 30-second voice note\n- Use case studies: 'A pharmacy in Nashik with 70 patients per day saw this result'\n- Match the testimonial to the prospect: same city, same size, same concern addressed\n- WhatsApp testimonial messages: save best ones and share at the right moment\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Using Testimonials and Case Studies Strategically in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: A testimonial from a similar store is 10x more persuasive than your own claim\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में प्रशंसापत्र और केस स्टडी लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: A testimonial from a similar store is 10x more persuasive than your own claim",
    "keyPoints": [
      "A testimonial from a similar store is 10x more persuasive than your own claim",
      "Collect testimonials: call satisfied customers and ask for a 30-second voice note",
      "Use case studies: 'A pharmacy in Nashik with 70 patients per day saw this result'",
      "Match the testimonial to the prospect: same city, same size, same concern addressed",
      "WhatsApp testimonial messages: save best ones and share at the right moment"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Using Testimonials and Case Studies Strategically'?",
        "questionHi": "'प्रशंसापत्र और केस स्टडी' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "A testimonial from a similar store is 10x more persuasive than your own claim",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "A testimonial from a similar store is 10x more persuasive than your own claim",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: A testimonial from a similar store is 10x more persuasive than your own claim",
        "explanationHi": "मुख्य सिद्धांत: A testimonial from a similar store is 10x more persuasive than your own claim"
      },
      {
        "questionEn": "In medicine pouch sales, 'Using Testimonials and Case Studies Strategically' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'प्रशंसापत्र और केस स्टडी' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Using Testimonials and Case Studies Strategically'?",
        "questionHi": "'प्रशंसापत्र और केस स्टडी' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Influence by Robert Cialdini",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Influence by Robert Cialdini",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Influence by Robert Cialdini",
        "explanationHi": "स्रोत: Influence by Robert Cialdini"
      },
      {
        "questionEn": "Key point 2 of 'Using Testimonials and Case Studies Strategically':",
        "questionHi": "'प्रशंसापत्र और केस स्टडी' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Collect testimonials: call satisfied customers and ask for a 30-second voice note",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Collect testimonials: call satisfied customers and ask for a 30-second voice note",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Collect testimonials: call satisfied customers and ask for a 30-second voice note",
        "explanationHi": "मुख्य बिंदु 2: Collect testimonials: call satisfied customers and ask for a 30-second voice note"
      },
      {
        "questionEn": "The final key takeaway from 'Using Testimonials and Case Studies Strategically' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'प्रशंसापत्र और केस स्टडी' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "WhatsApp testimonial messages: save best ones and share at the right moment",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "WhatsApp testimonial messages: save best ones and share at the right moment",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: WhatsApp testimonial messages: save best ones and share at the right moment",
        "explanationHi": "अंतिम सीख: WhatsApp testimonial messages: save best ones and share at the right moment"
      }
    ]
  },
  {
    "orderIndex": 75,
    "groupNumber": 11,
    "titleEn": "Evening Follow-Up Calls — The Underutilized Window",
    "titleHi": "शाम की फॉलो-अप कॉल",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "This topic covers Evening Follow-Up Calls — The Underutilized Window — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Medical store owners are often more available after 7pm when patient rush slows\n- Evening calls have 30 percent higher connect rate than midday for small stores\n- Frame the evening call: 'I know you are busy during the day — calling now for 2 minutes'\n- Evening is decision time: owner reflects on the day and is more open to planning\n- Track which prospects have said call in evening and batch those into an evening block\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक शाम की फॉलो-अप कॉल को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Medical store owners are often more available after 7pm when patient rush slows\n- Evening calls have 30 percent higher connect rate than midday for small stores\n- Frame the evening call: 'I know you are busy during the day — calling now for 2 minutes'\n- Evening is decision time: owner reflects on the day and is more open to planning\n- Track which prospects have said call in evening and batch those into an evening block\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Evening Follow-Up Calls in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Medical store owners are often more available after 7pm when patient rush slows\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में शाम की फॉलो-अप कॉल लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Medical store owners are often more available after 7pm when patient rush slows",
    "keyPoints": [
      "Medical store owners are often more available after 7pm when patient rush slows",
      "Evening calls have 30 percent higher connect rate than midday for small stores",
      "Frame the evening call: 'I know you are busy during the day — calling now for 2 minutes'",
      "Evening is decision time: owner reflects on the day and is more open to planning",
      "Track which prospects have said call in evening and batch those into an evening block"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Evening Follow-Up Calls'?",
        "questionHi": "'शाम की फॉलो-अप कॉल' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Medical store owners are often more available after 7pm when patient rush slows",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Medical store owners are often more available after 7pm when patient rush slows",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Medical store owners are often more available after 7pm when patient rush slows",
        "explanationHi": "मुख्य सिद्धांत: Medical store owners are often more available after 7pm when patient rush slows"
      },
      {
        "questionEn": "In medicine pouch sales, 'Evening Follow-Up Calls' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'शाम की फॉलो-अप कॉल' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Evening Follow-Up Calls'?",
        "questionHi": "'शाम की फॉलो-अप कॉल' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'Evening Follow-Up Calls — The Underutilized Window':",
        "questionHi": "'शाम की फॉलो-अप कॉल' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Evening calls have 30 percent higher connect rate than midday for small stores",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Evening calls have 30 percent higher connect rate than midday for small stores",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Evening calls have 30 percent higher connect rate than midday for small stores",
        "explanationHi": "मुख्य बिंदु 2: Evening calls have 30 percent higher connect rate than midday for small stores"
      },
      {
        "questionEn": "The final key takeaway from 'Evening Follow-Up Calls — The Underutilized Window' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'शाम की फॉलो-अप कॉल' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Track which prospects have said call in evening and batch those into an evening block",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Track which prospects have said call in evening and batch those into an evening block",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Track which prospects have said call in evening and batch those into an evening block",
        "explanationHi": "अंतिम सीख: Track which prospects have said call in evening and batch those into an evening block"
      }
    ]
  },
  {
    "orderIndex": 76,
    "groupNumber": 11,
    "titleEn": "The Art of the Warm Referral Call",
    "titleHi": "गर्म रेफरल कॉल",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 10,
    "contentEn": "This topic covers The Art of the Warm Referral Call — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Sales Bible by Jeffrey Gitomer: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Warm referral call: 'Rajesh bhai from Andheri Medical suggested I speak with you'\n- Immediately state the connection before anything else — the trust is pre-transferred\n- Mirror the conversation that Rajesh already had: 'He mentioned you are a busy store'\n- Warm referral close rate is 70 to 80 percent versus 10 to 15 percent cold calling\n- Always thank the referrer within 24 hours — this encourages future referrals\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक गर्म रेफरल कॉल को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Sales Bible by Jeffrey Gitomer से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Warm referral call: 'Rajesh bhai from Andheri Medical suggested I speak with you'\n- Immediately state the connection before anything else — the trust is pre-transferred\n- Mirror the conversation that Rajesh already had: 'He mentioned you are a busy store'\n- Warm referral close rate is 70 to 80 percent versus 10 to 15 percent cold calling\n- Always thank the referrer within 24 hours — this encourages future referrals\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Art of the Warm Referral Call in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Warm referral call: 'Rajesh bhai from Andheri Medical suggested I speak with you'\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में गर्म रेफरल कॉल लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Warm referral call: 'Rajesh bhai from Andheri Medical suggested I speak with you'",
    "keyPoints": [
      "Warm referral call: 'Rajesh bhai from Andheri Medical suggested I speak with you'",
      "Immediately state the connection before anything else — the trust is pre-transferred",
      "Mirror the conversation that Rajesh already had: 'He mentioned you are a busy store'",
      "Warm referral close rate is 70 to 80 percent versus 10 to 15 percent cold calling",
      "Always thank the referrer within 24 hours — this encourages future referrals"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Art of the Warm Referral Call'?",
        "questionHi": "'गर्म रेफरल कॉल' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Warm referral call: 'Rajesh bhai from Andheri Medical suggested I speak with you'",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Warm referral call: 'Rajesh bhai from Andheri Medical suggested I speak with you'",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Warm referral call: 'Rajesh bhai from Andheri Medical suggested I speak with you'",
        "explanationHi": "मुख्य सिद्धांत: Warm referral call: 'Rajesh bhai from Andheri Medical suggested I speak with you'"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Art of the Warm Referral Call' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'गर्म रेफरल कॉल' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Art of the Warm Referral Call'?",
        "questionHi": "'गर्म रेफरल कॉल' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Sales Bible by Jeffrey Gitomer",
        "explanationHi": "स्रोत: The Sales Bible by Jeffrey Gitomer"
      },
      {
        "questionEn": "Key point 2 of 'The Art of the Warm Referral Call':",
        "questionHi": "'गर्म रेफरल कॉल' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Immediately state the connection before anything else — the trust is pre-transferred",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Immediately state the connection before anything else — the trust is pre-transferred",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Immediately state the connection before anything else — the trust is pre-transferred",
        "explanationHi": "मुख्य बिंदु 2: Immediately state the connection before anything else — the trust is pre-transferred"
      },
      {
        "questionEn": "The final key takeaway from 'The Art of the Warm Referral Call' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'गर्म रेफरल कॉल' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Always thank the referrer within 24 hours — this encourages future referrals",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Always thank the referrer within 24 hours — this encourages future referrals",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Always thank the referrer within 24 hours — this encourages future referrals",
        "explanationHi": "अंतिम सीख: Always thank the referrer within 24 hours — this encourages future referrals"
      }
    ]
  },
  {
    "orderIndex": 77,
    "groupNumber": 11,
    "titleEn": "Objection: 'My Patients Do Not Care About Packaging'",
    "titleHi": "आपत्ति: मरीज़ पैकेजिंग की परवाह नहीं करते",
    "sourceBook": "The Challenger Sale",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "This topic covers Objection: 'My Patients Do Not Care About Packaging' — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Reframe: 'Your patients may not consciously care — but they subconsciously remember'\n- The memory test: 'Can your patients recall your phone number right now without a card?'\n- Branded pouch is a memory device — seen at home multiple times per week\n- Compare to store sign: 'Your patients see your sign for 2 seconds — the pouch for months'\n- Research shows visual repetition increases purchase intent even without awareness\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक आपत्ति: मरीज़ पैकेजिंग की परवाह नहीं करते को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Reframe: 'Your patients may not consciously care — but they subconsciously remember'\n- The memory test: 'Can your patients recall your phone number right now without a card?'\n- Branded pouch is a memory device — seen at home multiple times per week\n- Compare to store sign: 'Your patients see your sign for 2 seconds — the pouch for months'\n- Research shows visual repetition increases purchase intent even without awareness\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Objection: 'My Patients Do Not Care About Packaging' in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Reframe: 'Your patients may not consciously care — but they subconsciously remember'\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में आपत्ति: मरीज़ पैकेजिंग की परवाह नहीं करते लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Reframe: 'Your patients may not consciously care — but they subconsciously remember'",
    "keyPoints": [
      "Reframe: 'Your patients may not consciously care — but they subconsciously remember'",
      "The memory test: 'Can your patients recall your phone number right now without a card?'",
      "Branded pouch is a memory device — seen at home multiple times per week",
      "Compare to store sign: 'Your patients see your sign for 2 seconds — the pouch for months'",
      "Research shows visual repetition increases purchase intent even without awareness"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Objection: 'My Patients Do Not Care About Packaging''?",
        "questionHi": "'आपत्ति: मरीज़ पैकेजिंग की परवाह नहीं करते' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Reframe: 'Your patients may not consciously care — but they subconsciously remember'",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Reframe: 'Your patients may not consciously care — but they subconsciously remember'",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Reframe: 'Your patients may not consciously care — but they subconsciously remember'",
        "explanationHi": "मुख्य सिद्धांत: Reframe: 'Your patients may not consciously care — but they subconsciously remember'"
      },
      {
        "questionEn": "In medicine pouch sales, 'Objection: 'My Patients Do Not Care About Packaging'' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: मरीज़ पैकेजिंग की परवाह नहीं करते' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Objection: 'My Patients Do Not Care About Packaging''?",
        "questionHi": "'आपत्ति: मरीज़ पैकेजिंग की परवाह नहीं करते' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'Objection: 'My Patients Do Not Care About Packaging'':",
        "questionHi": "'आपत्ति: मरीज़ पैकेजिंग की परवाह नहीं करते' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "The memory test: 'Can your patients recall your phone number right now without a card?'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "The memory test: 'Can your patients recall your phone number right now without a card?'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: The memory test: 'Can your patients recall your phone number right now without a card?'",
        "explanationHi": "मुख्य बिंदु 2: The memory test: 'Can your patients recall your phone number right now without a card?'"
      },
      {
        "questionEn": "The final key takeaway from 'Objection: 'My Patients Do Not Care About Packaging'' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'आपत्ति: मरीज़ पैकेजिंग की परवाह नहीं करते' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Research shows visual repetition increases purchase intent even without awareness",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Research shows visual repetition increases purchase intent even without awareness",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Research shows visual repetition increases purchase intent even without awareness",
        "explanationHi": "अंतिम सीख: Research shows visual repetition increases purchase intent even without awareness"
      }
    ]
  },
  {
    "orderIndex": 78,
    "groupNumber": 11,
    "titleEn": "Relationship Maintenance Between Orders",
    "titleHi": "ऑर्डर के बीच संबंध बनाए रखना",
    "sourceBook": "How to Win Friends by Dale Carnegie",
    "difficulty": "ADVANCED",
    "estimatedMins": 10,
    "contentEn": "This topic covers Relationship Maintenance Between Orders — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from How to Win Friends by Dale Carnegie: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Do not disappear between delivery and reorder — stay visible and valuable\n- Monthly value add: share a pharmacy business tip via WhatsApp — no sales pitch\n- Festival greetings: personal voice note on Diwali and Eid builds strong goodwill\n- Call on their store anniversary if you know it: 'Congratulations on 10 years!'\n- Customers who hear from you between orders reorder 3x more reliably\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक ऑर्डर के बीच संबंध बनाए रखना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nHow to Win Friends by Dale Carnegie से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Do not disappear between delivery and reorder — stay visible and valuable\n- Monthly value add: share a pharmacy business tip via WhatsApp — no sales pitch\n- Festival greetings: personal voice note on Diwali and Eid builds strong goodwill\n- Call on their store anniversary if you know it: 'Congratulations on 10 years!'\n- Customers who hear from you between orders reorder 3x more reliably\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Relationship Maintenance Between Orders in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Do not disappear between delivery and reorder — stay visible and valuable\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में ऑर्डर के बीच संबंध बनाए रखना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Do not disappear between delivery and reorder — stay visible and valuable",
    "keyPoints": [
      "Do not disappear between delivery and reorder — stay visible and valuable",
      "Monthly value add: share a pharmacy business tip via WhatsApp — no sales pitch",
      "Festival greetings: personal voice note on Diwali and Eid builds strong goodwill",
      "Call on their store anniversary if you know it: 'Congratulations on 10 years!'",
      "Customers who hear from you between orders reorder 3x more reliably"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Relationship Maintenance Between Orders'?",
        "questionHi": "'ऑर्डर के बीच संबंध बनाए रखना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Do not disappear between delivery and reorder — stay visible and valuable",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Do not disappear between delivery and reorder — stay visible and valuable",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Do not disappear between delivery and reorder — stay visible and valuable",
        "explanationHi": "मुख्य सिद्धांत: Do not disappear between delivery and reorder — stay visible and valuable"
      },
      {
        "questionEn": "In medicine pouch sales, 'Relationship Maintenance Between Orders' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'ऑर्डर के बीच संबंध बनाए रखना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Relationship Maintenance Between Orders'?",
        "questionHi": "'ऑर्डर के बीच संबंध बनाए रखना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "How to Win Friends by Dale Carnegie",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "How to Win Friends by Dale Carnegie",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: How to Win Friends by Dale Carnegie",
        "explanationHi": "स्रोत: How to Win Friends by Dale Carnegie"
      },
      {
        "questionEn": "Key point 2 of 'Relationship Maintenance Between Orders':",
        "questionHi": "'ऑर्डर के बीच संबंध बनाए रखना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Monthly value add: share a pharmacy business tip via WhatsApp — no sales pitch",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Monthly value add: share a pharmacy business tip via WhatsApp — no sales pitch",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Monthly value add: share a pharmacy business tip via WhatsApp — no sales pitch",
        "explanationHi": "मुख्य बिंदु 2: Monthly value add: share a pharmacy business tip via WhatsApp — no sales pitch"
      },
      {
        "questionEn": "The final key takeaway from 'Relationship Maintenance Between Orders' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'ऑर्डर के बीच संबंध बनाए रखना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Customers who hear from you between orders reorder 3x more reliably",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Customers who hear from you between orders reorder 3x more reliably",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Customers who hear from you between orders reorder 3x more reliably",
        "explanationHi": "अंतिम सीख: Customers who hear from you between orders reorder 3x more reliably"
      }
    ]
  },
  {
    "orderIndex": 79,
    "groupNumber": 12,
    "titleEn": "The Negotiation Anchor — Starting Strong in Price Talks",
    "titleHi": "बातचीत एंकर",
    "sourceBook": "Never Split the Difference by Chris Voss",
    "difficulty": "ADVANCED",
    "estimatedMins": 11,
    "contentEn": "This topic covers The Negotiation Anchor — Starting Strong in Price Talks — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Never Split the Difference by Chris Voss: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Open any price negotiation with your highest justifiable anchor\n- The first number in a negotiation disproportionately shapes the entire outcome\n- After stating your anchor, go silent and wait for their counter\n- Respond to their counter with calibrated questions: 'How did you arrive at that number?'\n- Make concessions in decreasing amounts: 50 off then 25 off then 10 off signals floor\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक बातचीत एंकर को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nNever Split the Difference by Chris Voss से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Open any price negotiation with your highest justifiable anchor\n- The first number in a negotiation disproportionately shapes the entire outcome\n- After stating your anchor, go silent and wait for their counter\n- Respond to their counter with calibrated questions: 'How did you arrive at that number?'\n- Make concessions in decreasing amounts: 50 off then 25 off then 10 off signals floor\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Negotiation Anchor in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Open any price negotiation with your highest justifiable anchor\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में बातचीत एंकर लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Open any price negotiation with your highest justifiable anchor",
    "keyPoints": [
      "Open any price negotiation with your highest justifiable anchor",
      "The first number in a negotiation disproportionately shapes the entire outcome",
      "After stating your anchor, go silent and wait for their counter",
      "Respond to their counter with calibrated questions: 'How did you arrive at that number?'",
      "Make concessions in decreasing amounts: 50 off then 25 off then 10 off signals floor"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Negotiation Anchor'?",
        "questionHi": "'बातचीत एंकर' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Open any price negotiation with your highest justifiable anchor",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Open any price negotiation with your highest justifiable anchor",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Open any price negotiation with your highest justifiable anchor",
        "explanationHi": "मुख्य सिद्धांत: Open any price negotiation with your highest justifiable anchor"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Negotiation Anchor' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'बातचीत एंकर' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Negotiation Anchor'?",
        "questionHi": "'बातचीत एंकर' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Never Split the Difference by Chris Voss",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Never Split the Difference by Chris Voss",
        "explanationHi": "स्रोत: Never Split the Difference by Chris Voss"
      },
      {
        "questionEn": "Key point 2 of 'The Negotiation Anchor — Starting Strong in Price Talks':",
        "questionHi": "'बातचीत एंकर' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "The first number in a negotiation disproportionately shapes the entire outcome",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "The first number in a negotiation disproportionately shapes the entire outcome",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: The first number in a negotiation disproportionately shapes the entire outcome",
        "explanationHi": "मुख्य बिंदु 2: The first number in a negotiation disproportionately shapes the entire outcome"
      },
      {
        "questionEn": "The final key takeaway from 'The Negotiation Anchor — Starting Strong in Price Talks' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'बातचीत एंकर' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Make concessions in decreasing amounts: 50 off then 25 off then 10 off signals floor",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Make concessions in decreasing amounts: 50 off then 25 off then 10 off signals floor",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Make concessions in decreasing amounts: 50 off then 25 off then 10 off signals floor",
        "explanationHi": "अंतिम सीख: Make concessions in decreasing amounts: 50 off then 25 off then 10 off signals floor"
      }
    ]
  },
  {
    "orderIndex": 80,
    "groupNumber": 12,
    "titleEn": "Pipeline Velocity — How Fast Deals Move to Close",
    "titleHi": "पाइपलाइन वेलोसिटी",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "ADVANCED",
    "estimatedMins": 12,
    "contentEn": "This topic covers Pipeline Velocity — How Fast Deals Move to Close — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Pipeline velocity = number of deals times average value times close rate divided by sales cycle length\n- Identify where deals stall: is it after sample sent or after design approval?\n- Reduce stall time: have a specific follow-up within 48 hours of each milestone\n- Increase close rate: identify top 3 objections and have a perfect response for each\n- Increase average order size: introduce upsell during the design approval call\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक पाइपलाइन वेलोसिटी को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Pipeline velocity = number of deals times average value times close rate divided by sales cycle length\n- Identify where deals stall: is it after sample sent or after design approval?\n- Reduce stall time: have a specific follow-up within 48 hours of each milestone\n- Increase close rate: identify top 3 objections and have a perfect response for each\n- Increase average order size: introduce upsell during the design approval call\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Pipeline Velocity in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Pipeline velocity = number of deals times average value times close rate divided by sales cycle length\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में पाइपलाइन वेलोसिटी लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Pipeline velocity = number of deals times average value times close rate divided by sales cycle length",
    "keyPoints": [
      "Pipeline velocity = number of deals times average value times close rate divided by sales cycle length",
      "Identify where deals stall: is it after sample sent or after design approval?",
      "Reduce stall time: have a specific follow-up within 48 hours of each milestone",
      "Increase close rate: identify top 3 objections and have a perfect response for each",
      "Increase average order size: introduce upsell during the design approval call"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Pipeline Velocity'?",
        "questionHi": "'पाइपलाइन वेलोसिटी' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Pipeline velocity = number of deals times average value times close rate divided by sales cycle length",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Pipeline velocity = number of deals times average value times close rate divided by sales cycle length",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Pipeline velocity = number of deals times average value times close rate divided by sales cycle length",
        "explanationHi": "मुख्य सिद्धांत: Pipeline velocity = number of deals times average value times close rate divided by sales cycle length"
      },
      {
        "questionEn": "In medicine pouch sales, 'Pipeline Velocity' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'पाइपलाइन वेलोसिटी' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Pipeline Velocity'?",
        "questionHi": "'पाइपलाइन वेलोसिटी' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'Pipeline Velocity — How Fast Deals Move to Close':",
        "questionHi": "'पाइपलाइन वेलोसिटी' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Identify where deals stall: is it after sample sent or after design approval?",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Identify where deals stall: is it after sample sent or after design approval?",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Identify where deals stall: is it after sample sent or after design approval?",
        "explanationHi": "मुख्य बिंदु 2: Identify where deals stall: is it after sample sent or after design approval?"
      },
      {
        "questionEn": "The final key takeaway from 'Pipeline Velocity — How Fast Deals Move to Close' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'पाइपलाइन वेलोसिटी' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Increase average order size: introduce upsell during the design approval call",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Increase average order size: introduce upsell during the design approval call",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Increase average order size: introduce upsell during the design approval call",
        "explanationHi": "अंतिम सीख: Increase average order size: introduce upsell during the design approval call"
      }
    ]
  },
  {
    "orderIndex": 81,
    "groupNumber": 12,
    "titleEn": "Body Language on Video Calls — Looking Trustworthy on Screen",
    "titleHi": "वीडियो कॉल पर बॉडी लैंग्वेज",
    "sourceBook": "Emotional Intelligence by Daniel Goleman",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "This topic covers Body Language on Video Calls — Looking Trustworthy on Screen — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Emotional Intelligence by Daniel Goleman: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Camera at eye level — looking up or down changes perceived authority\n- Lighting matters: face illuminated from the front, not backlit\n- Lean slightly forward to signal engagement and interest\n- Nod during their speaking — visible active listening builds comfort\n- Background: neutral and clean signals professionalism even in a home setup\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक वीडियो कॉल पर बॉडी लैंग्वेज को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nEmotional Intelligence by Daniel Goleman से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Camera at eye level — looking up or down changes perceived authority\n- Lighting matters: face illuminated from the front, not backlit\n- Lean slightly forward to signal engagement and interest\n- Nod during their speaking — visible active listening builds comfort\n- Background: neutral and clean signals professionalism even in a home setup\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Body Language on Video Calls in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Camera at eye level — looking up or down changes perceived authority\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में वीडियो कॉल पर बॉडी लैंग्वेज लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Camera at eye level — looking up or down changes perceived authority",
    "keyPoints": [
      "Camera at eye level — looking up or down changes perceived authority",
      "Lighting matters: face illuminated from the front, not backlit",
      "Lean slightly forward to signal engagement and interest",
      "Nod during their speaking — visible active listening builds comfort",
      "Background: neutral and clean signals professionalism even in a home setup"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Body Language on Video Calls'?",
        "questionHi": "'वीडियो कॉल पर बॉडी लैंग्वेज' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Camera at eye level — looking up or down changes perceived authority",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Camera at eye level — looking up or down changes perceived authority",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Camera at eye level — looking up or down changes perceived authority",
        "explanationHi": "मुख्य सिद्धांत: Camera at eye level — looking up or down changes perceived authority"
      },
      {
        "questionEn": "In medicine pouch sales, 'Body Language on Video Calls' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'वीडियो कॉल पर बॉडी लैंग्वेज' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Body Language on Video Calls'?",
        "questionHi": "'वीडियो कॉल पर बॉडी लैंग्वेज' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Emotional Intelligence by Daniel Goleman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Emotional Intelligence by Daniel Goleman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Emotional Intelligence by Daniel Goleman",
        "explanationHi": "स्रोत: Emotional Intelligence by Daniel Goleman"
      },
      {
        "questionEn": "Key point 2 of 'Body Language on Video Calls — Looking Trustworthy on Screen':",
        "questionHi": "'वीडियो कॉल पर बॉडी लैंग्वेज' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Lighting matters: face illuminated from the front, not backlit",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Lighting matters: face illuminated from the front, not backlit",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Lighting matters: face illuminated from the front, not backlit",
        "explanationHi": "मुख्य बिंदु 2: Lighting matters: face illuminated from the front, not backlit"
      },
      {
        "questionEn": "The final key takeaway from 'Body Language on Video Calls — Looking Trustworthy on Screen' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'वीडियो कॉल पर बॉडी लैंग्वेज' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Background: neutral and clean signals professionalism even in a home setup",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Background: neutral and clean signals professionalism even in a home setup",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Background: neutral and clean signals professionalism even in a home setup",
        "explanationHi": "अंतिम सीख: Background: neutral and clean signals professionalism even in a home setup"
      }
    ]
  },
  {
    "orderIndex": 82,
    "groupNumber": 12,
    "titleEn": "Ethical Selling — Long-Term Trust Over Short-Term Gain",
    "titleHi": "नैतिक बिक्री",
    "sourceBook": "The Trusted Advisor by David Maister",
    "difficulty": "PRO",
    "estimatedMins": 12,
    "contentEn": "This topic covers Ethical Selling — Long-Term Trust Over Short-Term Gain — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Trusted Advisor by David Maister: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Ethical selling means recommending what is genuinely right for the customer\n- If a store genuinely needs only 2500 pieces — say so, do not push 5000\n- Honest about limitations: 'If you need delivery in 5 days, we cannot do that'\n- Long-term ethical reputation generates referrals and reorders automatically\n- A reputation for honesty is your most durable competitive advantage\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक नैतिक बिक्री को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Trusted Advisor by David Maister से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Ethical selling means recommending what is genuinely right for the customer\n- If a store genuinely needs only 2500 pieces — say so, do not push 5000\n- Honest about limitations: 'If you need delivery in 5 days, we cannot do that'\n- Long-term ethical reputation generates referrals and reorders automatically\n- A reputation for honesty is your most durable competitive advantage\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Ethical Selling in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Ethical selling means recommending what is genuinely right for the customer\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में नैतिक बिक्री लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Ethical selling means recommending what is genuinely right for the customer",
    "keyPoints": [
      "Ethical selling means recommending what is genuinely right for the customer",
      "If a store genuinely needs only 2500 pieces — say so, do not push 5000",
      "Honest about limitations: 'If you need delivery in 5 days, we cannot do that'",
      "Long-term ethical reputation generates referrals and reorders automatically",
      "A reputation for honesty is your most durable competitive advantage"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Ethical Selling'?",
        "questionHi": "'नैतिक बिक्री' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Ethical selling means recommending what is genuinely right for the customer",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Ethical selling means recommending what is genuinely right for the customer",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Ethical selling means recommending what is genuinely right for the customer",
        "explanationHi": "मुख्य सिद्धांत: Ethical selling means recommending what is genuinely right for the customer"
      },
      {
        "questionEn": "In medicine pouch sales, 'Ethical Selling' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'नैतिक बिक्री' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Ethical Selling'?",
        "questionHi": "'नैतिक बिक्री' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Trusted Advisor by David Maister",
        "explanationHi": "स्रोत: The Trusted Advisor by David Maister"
      },
      {
        "questionEn": "Key point 2 of 'Ethical Selling — Long-Term Trust Over Short-Term Gain':",
        "questionHi": "'नैतिक बिक्री' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "If a store genuinely needs only 2500 pieces — say so, do not push 5000",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "If a store genuinely needs only 2500 pieces — say so, do not push 5000",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: If a store genuinely needs only 2500 pieces — say so, do not push 5000",
        "explanationHi": "मुख्य बिंदु 2: If a store genuinely needs only 2500 pieces — say so, do not push 5000"
      },
      {
        "questionEn": "The final key takeaway from 'Ethical Selling — Long-Term Trust Over Short-Term Gain' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'नैतिक बिक्री' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "A reputation for honesty is your most durable competitive advantage",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "A reputation for honesty is your most durable competitive advantage",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: A reputation for honesty is your most durable competitive advantage",
        "explanationHi": "अंतिम सीख: A reputation for honesty is your most durable competitive advantage"
      }
    ]
  },
  {
    "orderIndex": 83,
    "groupNumber": 12,
    "titleEn": "Objection: 'I Have Seen Your Sample and It Is Not That Great'",
    "titleHi": "आपत्ति: सैम्पल अच्छा नहीं था",
    "sourceBook": "The Challenger Sale",
    "difficulty": "ADVANCED",
    "estimatedMins": 11,
    "contentEn": "This topic covers Objection: 'I Have Seen Your Sample and It Is Not That Great' — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- This is the most valuable objection — they engaged, they looked, they compared\n- Ask immediately: 'Thank you for the honest feedback. What specifically was not right?'\n- Common issues: color off, font too small, paper lighter than expected\n- Offer a redesign or a better-quality physical sample before giving up\n- Most 'sample quality' objections are actually design preferences that can be fixed\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक आपत्ति: सैम्पल अच्छा नहीं था को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- This is the most valuable objection — they engaged, they looked, they compared\n- Ask immediately: 'Thank you for the honest feedback. What specifically was not right?'\n- Common issues: color off, font too small, paper lighter than expected\n- Offer a redesign or a better-quality physical sample before giving up\n- Most 'sample quality' objections are actually design preferences that can be fixed\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Objection: 'I Have Seen Your Sample and It Is Not That Great' in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: This is the most valuable objection — they engaged, they looked, they compared\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में आपत्ति: सैम्पल अच्छा नहीं था लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: This is the most valuable objection — they engaged, they looked, they compared",
    "keyPoints": [
      "This is the most valuable objection — they engaged, they looked, they compared",
      "Ask immediately: 'Thank you for the honest feedback. What specifically was not right?'",
      "Common issues: color off, font too small, paper lighter than expected",
      "Offer a redesign or a better-quality physical sample before giving up",
      "Most 'sample quality' objections are actually design preferences that can be fixed"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Objection: 'I Have Seen Your Sample and It Is Not That Great''?",
        "questionHi": "'आपत्ति: सैम्पल अच्छा नहीं था' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "This is the most valuable objection — they engaged, they looked, they compared",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "This is the most valuable objection — they engaged, they looked, they compared",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: This is the most valuable objection — they engaged, they looked, they compared",
        "explanationHi": "मुख्य सिद्धांत: This is the most valuable objection — they engaged, they looked, they compared"
      },
      {
        "questionEn": "In medicine pouch sales, 'Objection: 'I Have Seen Your Sample and It Is Not That Great'' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: सैम्पल अच्छा नहीं था' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Objection: 'I Have Seen Your Sample and It Is Not That Great''?",
        "questionHi": "'आपत्ति: सैम्पल अच्छा नहीं था' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'Objection: 'I Have Seen Your Sample and It Is Not That Great'':",
        "questionHi": "'आपत्ति: सैम्पल अच्छा नहीं था' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Ask immediately: 'Thank you for the honest feedback. What specifically was not right?'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Ask immediately: 'Thank you for the honest feedback. What specifically was not right?'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Ask immediately: 'Thank you for the honest feedback. What specifically was not right?'",
        "explanationHi": "मुख्य बिंदु 2: Ask immediately: 'Thank you for the honest feedback. What specifically was not right?'"
      },
      {
        "questionEn": "The final key takeaway from 'Objection: 'I Have Seen Your Sample and It Is Not That Great'' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'आपत्ति: सैम्पल अच्छा नहीं था' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Most 'sample quality' objections are actually design preferences that can be fixed",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Most 'sample quality' objections are actually design preferences that can be fixed",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Most 'sample quality' objections are actually design preferences that can be fixed",
        "explanationHi": "अंतिम सीख: Most 'sample quality' objections are actually design preferences that can be fixed"
      }
    ]
  },
  {
    "orderIndex": 84,
    "groupNumber": 12,
    "titleEn": "Objection: 'Delivery Takes Too Long'",
    "titleHi": "आपत्ति: डिलीवरी में बहुत समय लगता है",
    "sourceBook": "Sell or Be Sold by Grant Cardone",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 8,
    "contentEn": "This topic covers Objection: 'Delivery Takes Too Long' — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Sell or Be Sold by Grant Cardone: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- 10 to 15 working days is standard for custom print — position it as quality production time\n- Reframe: 'We take the time to get your design exactly right — not rushed, not wrong'\n- For urgent need: 'If you need before a specific date, let us work backward together'\n- Rush order option: premium pricing for 7 working day delivery when available\n- Pre-order strategy: 'Order 30 days early and you will always have stock on time'\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक आपत्ति: डिलीवरी में बहुत समय लगता है को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nSell or Be Sold by Grant Cardone से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- 10 to 15 working days is standard for custom print — position it as quality production time\n- Reframe: 'We take the time to get your design exactly right — not rushed, not wrong'\n- For urgent need: 'If you need before a specific date, let us work backward together'\n- Rush order option: premium pricing for 7 working day delivery when available\n- Pre-order strategy: 'Order 30 days early and you will always have stock on time'\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Objection: 'Delivery Takes Too Long' in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: 10 to 15 working days is standard for custom print — position it as quality production time\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में आपत्ति: डिलीवरी में बहुत समय लगता है लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: 10 to 15 working days is standard for custom print — position it as quality production time",
    "keyPoints": [
      "10 to 15 working days is standard for custom print — position it as quality production time",
      "Reframe: 'We take the time to get your design exactly right — not rushed, not wrong'",
      "For urgent need: 'If you need before a specific date, let us work backward together'",
      "Rush order option: premium pricing for 7 working day delivery when available",
      "Pre-order strategy: 'Order 30 days early and you will always have stock on time'"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Objection: 'Delivery Takes Too Long''?",
        "questionHi": "'आपत्ति: डिलीवरी में बहुत समय लगता है' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "10 to 15 working days is standard for custom print — position it as quality production time",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "10 to 15 working days is standard for custom print — position it as quality production time",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: 10 to 15 working days is standard for custom print — position it as quality production time",
        "explanationHi": "मुख्य सिद्धांत: 10 to 15 working days is standard for custom print — position it as quality production time"
      },
      {
        "questionEn": "In medicine pouch sales, 'Objection: 'Delivery Takes Too Long'' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: डिलीवरी में बहुत समय लगता है' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Objection: 'Delivery Takes Too Long''?",
        "questionHi": "'आपत्ति: डिलीवरी में बहुत समय लगता है' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Sell or Be Sold by Grant Cardone",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Sell or Be Sold by Grant Cardone",
        "explanationHi": "स्रोत: Sell or Be Sold by Grant Cardone"
      },
      {
        "questionEn": "Key point 2 of 'Objection: 'Delivery Takes Too Long'':",
        "questionHi": "'आपत्ति: डिलीवरी में बहुत समय लगता है' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Reframe: 'We take the time to get your design exactly right — not rushed, not wrong'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Reframe: 'We take the time to get your design exactly right — not rushed, not wrong'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Reframe: 'We take the time to get your design exactly right — not rushed, not wrong'",
        "explanationHi": "मुख्य बिंदु 2: Reframe: 'We take the time to get your design exactly right — not rushed, not wrong'"
      },
      {
        "questionEn": "The final key takeaway from 'Objection: 'Delivery Takes Too Long'' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'आपत्ति: डिलीवरी में बहुत समय लगता है' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Pre-order strategy: 'Order 30 days early and you will always have stock on time'",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Pre-order strategy: 'Order 30 days early and you will always have stock on time'",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Pre-order strategy: 'Order 30 days early and you will always have stock on time'",
        "explanationHi": "अंतिम सीख: Pre-order strategy: 'Order 30 days early and you will always have stock on time'"
      }
    ]
  },
  {
    "orderIndex": 85,
    "groupNumber": 12,
    "titleEn": "The Pre-Call Research Ritual",
    "titleHi": "प्री-कॉल रिसर्च अनुष्ठान",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "This topic covers The Pre-Call Research Ritual — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- 30 seconds of Google Maps before every call: store name, location, review count\n- Check if the store appeared in any local news: grand opening, renovation, award\n- Note the store's specialty if visible: hospital adjacent, standalone, chain location\n- Search the owner's name on LinkedIn or Facebook for any personal connection\n- One specific fact per call: 'I noticed you recently added a second counter' builds instant rapport\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक प्री-कॉल रिसर्च अनुष्ठान को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- 30 seconds of Google Maps before every call: store name, location, review count\n- Check if the store appeared in any local news: grand opening, renovation, award\n- Note the store's specialty if visible: hospital adjacent, standalone, chain location\n- Search the owner's name on LinkedIn or Facebook for any personal connection\n- One specific fact per call: 'I noticed you recently added a second counter' builds instant rapport\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Pre-Call Research Ritual in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: 30 seconds of Google Maps before every call: store name, location, review count\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में प्री-कॉल रिसर्च अनुष्ठान लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: 30 seconds of Google Maps before every call: store name, location, review count",
    "keyPoints": [
      "30 seconds of Google Maps before every call: store name, location, review count",
      "Check if the store appeared in any local news: grand opening, renovation, award",
      "Note the store's specialty if visible: hospital adjacent, standalone, chain location",
      "Search the owner's name on LinkedIn or Facebook for any personal connection",
      "One specific fact per call: 'I noticed you recently added a second counter' builds instant rapport"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Pre-Call Research Ritual'?",
        "questionHi": "'प्री-कॉल रिसर्च अनुष्ठान' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "30 seconds of Google Maps before every call: store name, location, review count",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "30 seconds of Google Maps before every call: store name, location, review count",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: 30 seconds of Google Maps before every call: store name, location, review count",
        "explanationHi": "मुख्य सिद्धांत: 30 seconds of Google Maps before every call: store name, location, review count"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Pre-Call Research Ritual' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'प्री-कॉल रिसर्च अनुष्ठान' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Pre-Call Research Ritual'?",
        "questionHi": "'प्री-कॉल रिसर्च अनुष्ठान' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'The Pre-Call Research Ritual':",
        "questionHi": "'प्री-कॉल रिसर्च अनुष्ठान' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Check if the store appeared in any local news: grand opening, renovation, award",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Check if the store appeared in any local news: grand opening, renovation, award",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Check if the store appeared in any local news: grand opening, renovation, award",
        "explanationHi": "मुख्य बिंदु 2: Check if the store appeared in any local news: grand opening, renovation, award"
      },
      {
        "questionEn": "The final key takeaway from 'The Pre-Call Research Ritual' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'प्री-कॉल रिसर्च अनुष्ठान' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "One specific fact per call: 'I noticed you recently added a second counter' builds instant rapport",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "One specific fact per call: 'I noticed you recently added a second counter' builds instant rapport",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: One specific fact per call: 'I noticed you recently added a second counter' builds instant rapport",
        "explanationHi": "अंतिम सीख: One specific fact per call: 'I noticed you recently added a second counter' builds instant rapport"
      }
    ]
  },
  {
    "orderIndex": 86,
    "groupNumber": 12,
    "titleEn": "Post-Order Excellence — Delivery to Delight",
    "titleHi": "ऑर्डर के बाद उत्कृष्टता",
    "sourceBook": "The Trusted Advisor by David Maister",
    "difficulty": "ADVANCED",
    "estimatedMins": 12,
    "contentEn": "This topic covers Post-Order Excellence — Delivery to Delight — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Trusted Advisor by David Maister: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- The post-order experience determines whether they reorder and refer\n- Design proof turnaround: 24 hours maximum from order to design preview sent\n- Delivery update: proactive message when order ships with tracking details\n- Unboxing call: call 2 days after delivery to check that everything arrived correctly\n- Delight moment: include a handwritten thank-you note in the first shipment\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक ऑर्डर के बाद उत्कृष्टता को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Trusted Advisor by David Maister से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- The post-order experience determines whether they reorder and refer\n- Design proof turnaround: 24 hours maximum from order to design preview sent\n- Delivery update: proactive message when order ships with tracking details\n- Unboxing call: call 2 days after delivery to check that everything arrived correctly\n- Delight moment: include a handwritten thank-you note in the first shipment\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Post-Order Excellence in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: The post-order experience determines whether they reorder and refer\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में ऑर्डर के बाद उत्कृष्टता लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: The post-order experience determines whether they reorder and refer",
    "keyPoints": [
      "The post-order experience determines whether they reorder and refer",
      "Design proof turnaround: 24 hours maximum from order to design preview sent",
      "Delivery update: proactive message when order ships with tracking details",
      "Unboxing call: call 2 days after delivery to check that everything arrived correctly",
      "Delight moment: include a handwritten thank-you note in the first shipment"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Post-Order Excellence'?",
        "questionHi": "'ऑर्डर के बाद उत्कृष्टता' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "The post-order experience determines whether they reorder and refer",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "The post-order experience determines whether they reorder and refer",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: The post-order experience determines whether they reorder and refer",
        "explanationHi": "मुख्य सिद्धांत: The post-order experience determines whether they reorder and refer"
      },
      {
        "questionEn": "In medicine pouch sales, 'Post-Order Excellence' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'ऑर्डर के बाद उत्कृष्टता' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Post-Order Excellence'?",
        "questionHi": "'ऑर्डर के बाद उत्कृष्टता' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Trusted Advisor by David Maister",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Trusted Advisor by David Maister",
        "explanationHi": "स्रोत: The Trusted Advisor by David Maister"
      },
      {
        "questionEn": "Key point 2 of 'Post-Order Excellence — Delivery to Delight':",
        "questionHi": "'ऑर्डर के बाद उत्कृष्टता' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Design proof turnaround: 24 hours maximum from order to design preview sent",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Design proof turnaround: 24 hours maximum from order to design preview sent",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Design proof turnaround: 24 hours maximum from order to design preview sent",
        "explanationHi": "मुख्य बिंदु 2: Design proof turnaround: 24 hours maximum from order to design preview sent"
      },
      {
        "questionEn": "The final key takeaway from 'Post-Order Excellence — Delivery to Delight' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'ऑर्डर के बाद उत्कृष्टता' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Delight moment: include a handwritten thank-you note in the first shipment",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Delight moment: include a handwritten thank-you note in the first shipment",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Delight moment: include a handwritten thank-you note in the first shipment",
        "explanationHi": "अंतिम सीख: Delight moment: include a handwritten thank-you note in the first shipment"
      }
    ]
  },
  {
    "orderIndex": 87,
    "groupNumber": 13,
    "titleEn": "Psychology of Color in Packaging — What Colors Mean to Chemists",
    "titleHi": "रंग का मनोविज्ञान",
    "sourceBook": "Predictably Irrational by Dan Ariely",
    "difficulty": "ADVANCED",
    "estimatedMins": 10,
    "contentEn": "This topic covers Psychology of Color in Packaging — What Colors Mean to Chemists — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Predictably Irrational by Dan Ariely: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Color choice in pouch design affects patient perception of the pharmacy\n- Blue: trust, professionalism, cleanliness — most popular for pharmacy branding\n- Green: health, nature, wellness — strong for stores near hospitals\n- Red and orange: urgency, energy — avoid for pharmacy packaging (anxiety association)\n- Advise chemists on color choice: your expertise here builds consultative credibility\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक रंग का मनोविज्ञान को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nPredictably Irrational by Dan Ariely से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Color choice in pouch design affects patient perception of the pharmacy\n- Blue: trust, professionalism, cleanliness — most popular for pharmacy branding\n- Green: health, nature, wellness — strong for stores near hospitals\n- Red and orange: urgency, energy — avoid for pharmacy packaging (anxiety association)\n- Advise chemists on color choice: your expertise here builds consultative credibility\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Psychology of Color in Packaging in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Color choice in pouch design affects patient perception of the pharmacy\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में रंग का मनोविज्ञान लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Color choice in pouch design affects patient perception of the pharmacy",
    "keyPoints": [
      "Color choice in pouch design affects patient perception of the pharmacy",
      "Blue: trust, professionalism, cleanliness — most popular for pharmacy branding",
      "Green: health, nature, wellness — strong for stores near hospitals",
      "Red and orange: urgency, energy — avoid for pharmacy packaging (anxiety association)",
      "Advise chemists on color choice: your expertise here builds consultative credibility"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Psychology of Color in Packaging'?",
        "questionHi": "'रंग का मनोविज्ञान' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Color choice in pouch design affects patient perception of the pharmacy",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Color choice in pouch design affects patient perception of the pharmacy",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Color choice in pouch design affects patient perception of the pharmacy",
        "explanationHi": "मुख्य सिद्धांत: Color choice in pouch design affects patient perception of the pharmacy"
      },
      {
        "questionEn": "In medicine pouch sales, 'Psychology of Color in Packaging' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'रंग का मनोविज्ञान' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Psychology of Color in Packaging'?",
        "questionHi": "'रंग का मनोविज्ञान' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Predictably Irrational by Dan Ariely",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Predictably Irrational by Dan Ariely",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Predictably Irrational by Dan Ariely",
        "explanationHi": "स्रोत: Predictably Irrational by Dan Ariely"
      },
      {
        "questionEn": "Key point 2 of 'Psychology of Color in Packaging — What Colors Mean to Chemists':",
        "questionHi": "'रंग का मनोविज्ञान' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Blue: trust, professionalism, cleanliness — most popular for pharmacy branding",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Blue: trust, professionalism, cleanliness — most popular for pharmacy branding",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Blue: trust, professionalism, cleanliness — most popular for pharmacy branding",
        "explanationHi": "मुख्य बिंदु 2: Blue: trust, professionalism, cleanliness — most popular for pharmacy branding"
      },
      {
        "questionEn": "The final key takeaway from 'Psychology of Color in Packaging — What Colors Mean to Chemists' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'रंग का मनोविज्ञान' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Advise chemists on color choice: your expertise here builds consultative credibility",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Advise chemists on color choice: your expertise here builds consultative credibility",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Advise chemists on color choice: your expertise here builds consultative credibility",
        "explanationHi": "अंतिम सीख: Advise chemists on color choice: your expertise here builds consultative credibility"
      }
    ]
  },
  {
    "orderIndex": 88,
    "groupNumber": 13,
    "titleEn": "The One-Page Proposal — Closing on Paper",
    "titleHi": "वन-पेज प्रस्ताव",
    "sourceBook": "The Challenger Sale",
    "difficulty": "ADVANCED",
    "estimatedMins": 11,
    "contentEn": "This topic covers The One-Page Proposal — Closing on Paper — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- A one-page written proposal makes the chemist see the decision as concrete\n- Proposal elements: their name, recommended size, quantity, price, payment terms, timeline\n- Keep it to one page — more feels like a contract and creates resistance\n- WhatsApp the proposal as a PDF after your confirmation call\n- Proposal creates commitment anchoring — harder to back out once they have seen it in writing\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक वन-पेज प्रस्ताव को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- A one-page written proposal makes the chemist see the decision as concrete\n- Proposal elements: their name, recommended size, quantity, price, payment terms, timeline\n- Keep it to one page — more feels like a contract and creates resistance\n- WhatsApp the proposal as a PDF after your confirmation call\n- Proposal creates commitment anchoring — harder to back out once they have seen it in writing\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The One-Page Proposal in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: A one-page written proposal makes the chemist see the decision as concrete\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में वन-पेज प्रस्ताव लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: A one-page written proposal makes the chemist see the decision as concrete",
    "keyPoints": [
      "A one-page written proposal makes the chemist see the decision as concrete",
      "Proposal elements: their name, recommended size, quantity, price, payment terms, timeline",
      "Keep it to one page — more feels like a contract and creates resistance",
      "WhatsApp the proposal as a PDF after your confirmation call",
      "Proposal creates commitment anchoring — harder to back out once they have seen it in writing"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The One-Page Proposal'?",
        "questionHi": "'वन-पेज प्रस्ताव' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "A one-page written proposal makes the chemist see the decision as concrete",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "A one-page written proposal makes the chemist see the decision as concrete",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: A one-page written proposal makes the chemist see the decision as concrete",
        "explanationHi": "मुख्य सिद्धांत: A one-page written proposal makes the chemist see the decision as concrete"
      },
      {
        "questionEn": "In medicine pouch sales, 'The One-Page Proposal' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'वन-पेज प्रस्ताव' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The One-Page Proposal'?",
        "questionHi": "'वन-पेज प्रस्ताव' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'The One-Page Proposal — Closing on Paper':",
        "questionHi": "'वन-पेज प्रस्ताव' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Proposal elements: their name, recommended size, quantity, price, payment terms, timeline",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Proposal elements: their name, recommended size, quantity, price, payment terms, timeline",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Proposal elements: their name, recommended size, quantity, price, payment terms, timeline",
        "explanationHi": "मुख्य बिंदु 2: Proposal elements: their name, recommended size, quantity, price, payment terms, timeline"
      },
      {
        "questionEn": "The final key takeaway from 'The One-Page Proposal — Closing on Paper' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'वन-पेज प्रस्ताव' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Proposal creates commitment anchoring — harder to back out once they have seen it in writing",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Proposal creates commitment anchoring — harder to back out once they have seen it in writing",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Proposal creates commitment anchoring — harder to back out once they have seen it in writing",
        "explanationHi": "अंतिम सीख: Proposal creates commitment anchoring — harder to back out once they have seen it in writing"
      }
    ]
  },
  {
    "orderIndex": 89,
    "groupNumber": 13,
    "titleEn": "Handling the 'Send Me the Sample First' Delay Tactic",
    "titleHi": "'पहले सैम्पल भेजें' देरी रणनीति संभालना",
    "sourceBook": "SPIN Selling by Neil Rackham",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "This topic covers Handling the 'Send Me the Sample First' Delay Tactic — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from SPIN Selling by Neil Rackham: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Sample request is often genuine interest with a delayed decision\n- Always send the sample — but set a clear follow-up timeline upfront\n- 'I will send the physical sample this week. May I call you Thursday to get your feedback?'\n- Physical samples close 40 percent better than digital images alone\n- For distant customers: send a high-resolution printed sample sheet via courier\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक 'पहले सैम्पल भेजें' देरी रणनीति संभालना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nSPIN Selling by Neil Rackham से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Sample request is often genuine interest with a delayed decision\n- Always send the sample — but set a clear follow-up timeline upfront\n- 'I will send the physical sample this week. May I call you Thursday to get your feedback?'\n- Physical samples close 40 percent better than digital images alone\n- For distant customers: send a high-resolution printed sample sheet via courier\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Handling the 'Send Me the Sample First' Delay Tactic in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Sample request is often genuine interest with a delayed decision\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में 'पहले सैम्पल भेजें' देरी रणनीति संभालना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Sample request is often genuine interest with a delayed decision",
    "keyPoints": [
      "Sample request is often genuine interest with a delayed decision",
      "Always send the sample — but set a clear follow-up timeline upfront",
      "'I will send the physical sample this week. May I call you Thursday to get your feedback?'",
      "Physical samples close 40 percent better than digital images alone",
      "For distant customers: send a high-resolution printed sample sheet via courier"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Handling the 'Send Me the Sample First' Delay Tactic'?",
        "questionHi": "''पहले सैम्पल भेजें' देरी रणनीति संभालना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Sample request is often genuine interest with a delayed decision",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Sample request is often genuine interest with a delayed decision",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Sample request is often genuine interest with a delayed decision",
        "explanationHi": "मुख्य सिद्धांत: Sample request is often genuine interest with a delayed decision"
      },
      {
        "questionEn": "In medicine pouch sales, 'Handling the 'Send Me the Sample First' Delay Tactic' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में ''पहले सैम्पल भेजें' देरी रणनीति संभालना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Handling the 'Send Me the Sample First' Delay Tactic'?",
        "questionHi": "''पहले सैम्पल भेजें' देरी रणनीति संभालना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "SPIN Selling by Neil Rackham",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "SPIN Selling by Neil Rackham",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: SPIN Selling by Neil Rackham",
        "explanationHi": "स्रोत: SPIN Selling by Neil Rackham"
      },
      {
        "questionEn": "Key point 2 of 'Handling the 'Send Me the Sample First' Delay Tactic':",
        "questionHi": "''पहले सैम्पल भेजें' देरी रणनीति संभालना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Always send the sample — but set a clear follow-up timeline upfront",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Always send the sample — but set a clear follow-up timeline upfront",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Always send the sample — but set a clear follow-up timeline upfront",
        "explanationHi": "मुख्य बिंदु 2: Always send the sample — but set a clear follow-up timeline upfront"
      },
      {
        "questionEn": "The final key takeaway from 'Handling the 'Send Me the Sample First' Delay Tactic' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए ''पहले सैम्पल भेजें' देरी रणनीति संभालना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "For distant customers: send a high-resolution printed sample sheet via courier",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "For distant customers: send a high-resolution printed sample sheet via courier",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: For distant customers: send a high-resolution printed sample sheet via courier",
        "explanationHi": "अंतिम सीख: For distant customers: send a high-resolution printed sample sheet via courier"
      }
    ]
  },
  {
    "orderIndex": 90,
    "groupNumber": 13,
    "titleEn": "Mindfulness in Sales — Staying Present on Every Call",
    "titleHi": "सेल्स में माइंडफुलनेस",
    "sourceBook": "Emotional Intelligence by Daniel Goleman",
    "difficulty": "PRO",
    "estimatedMins": 11,
    "contentEn": "This topic covers Mindfulness in Sales — Staying Present on Every Call — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Emotional Intelligence by Daniel Goleman: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Mindfulness means giving full attention to this call — not thinking about the last one\n- Presence is detected: a distracted salesperson loses rapport within 30 seconds\n- Pre-call ritual: 3 deep breaths, clear your mind of the previous call outcome\n- Single-tasking: no WhatsApp checking while on a call — the chemist hears distraction\n- After a tough call: 60 seconds of reflection before the next one resets your state\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक सेल्स में माइंडफुलनेस को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nEmotional Intelligence by Daniel Goleman से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Mindfulness means giving full attention to this call — not thinking about the last one\n- Presence is detected: a distracted salesperson loses rapport within 30 seconds\n- Pre-call ritual: 3 deep breaths, clear your mind of the previous call outcome\n- Single-tasking: no WhatsApp checking while on a call — the chemist hears distraction\n- After a tough call: 60 seconds of reflection before the next one resets your state\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Mindfulness in Sales in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Mindfulness means giving full attention to this call — not thinking about the last one\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में सेल्स में माइंडफुलनेस लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Mindfulness means giving full attention to this call — not thinking about the last one",
    "keyPoints": [
      "Mindfulness means giving full attention to this call — not thinking about the last one",
      "Presence is detected: a distracted salesperson loses rapport within 30 seconds",
      "Pre-call ritual: 3 deep breaths, clear your mind of the previous call outcome",
      "Single-tasking: no WhatsApp checking while on a call — the chemist hears distraction",
      "After a tough call: 60 seconds of reflection before the next one resets your state"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Mindfulness in Sales'?",
        "questionHi": "'सेल्स में माइंडफुलनेस' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Mindfulness means giving full attention to this call — not thinking about the last one",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Mindfulness means giving full attention to this call — not thinking about the last one",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Mindfulness means giving full attention to this call — not thinking about the last one",
        "explanationHi": "मुख्य सिद्धांत: Mindfulness means giving full attention to this call — not thinking about the last one"
      },
      {
        "questionEn": "In medicine pouch sales, 'Mindfulness in Sales' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'सेल्स में माइंडफुलनेस' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Mindfulness in Sales'?",
        "questionHi": "'सेल्स में माइंडफुलनेस' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Emotional Intelligence by Daniel Goleman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Emotional Intelligence by Daniel Goleman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Emotional Intelligence by Daniel Goleman",
        "explanationHi": "स्रोत: Emotional Intelligence by Daniel Goleman"
      },
      {
        "questionEn": "Key point 2 of 'Mindfulness in Sales — Staying Present on Every Call':",
        "questionHi": "'सेल्स में माइंडफुलनेस' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Presence is detected: a distracted salesperson loses rapport within 30 seconds",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Presence is detected: a distracted salesperson loses rapport within 30 seconds",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Presence is detected: a distracted salesperson loses rapport within 30 seconds",
        "explanationHi": "मुख्य बिंदु 2: Presence is detected: a distracted salesperson loses rapport within 30 seconds"
      },
      {
        "questionEn": "The final key takeaway from 'Mindfulness in Sales — Staying Present on Every Call' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'सेल्स में माइंडफुलनेस' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "After a tough call: 60 seconds of reflection before the next one resets your state",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "After a tough call: 60 seconds of reflection before the next one resets your state",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: After a tough call: 60 seconds of reflection before the next one resets your state",
        "explanationHi": "अंतिम सीख: After a tough call: 60 seconds of reflection before the next one resets your state"
      }
    ]
  },
  {
    "orderIndex": 91,
    "groupNumber": 14,
    "titleEn": "Understanding Chemist Business Cycles",
    "titleHi": "केमिस्ट व्यापार चक्र समझना",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 11,
    "contentEn": "This topic covers Understanding Chemist Business Cycles — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Chemists have monthly restocking cycles aligned with their medicine suppliers\n- End of month is often cash-tight — beginning of month is better for new spending\n- Festival months (October, November, March) = peak medicine sales = peak pouch demand\n- January and July are typically slower — use for relationship building not hard pitching\n- Align your follow-up timing to their business cycle for maximum receptivity\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक केमिस्ट व्यापार चक्र समझना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Chemists have monthly restocking cycles aligned with their medicine suppliers\n- End of month is often cash-tight — beginning of month is better for new spending\n- Festival months (October, November, March) = peak medicine sales = peak pouch demand\n- January and July are typically slower — use for relationship building not hard pitching\n- Align your follow-up timing to their business cycle for maximum receptivity\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Understanding Chemist Business Cycles in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Chemists have monthly restocking cycles aligned with their medicine suppliers\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में केमिस्ट व्यापार चक्र समझना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Chemists have monthly restocking cycles aligned with their medicine suppliers",
    "keyPoints": [
      "Chemists have monthly restocking cycles aligned with their medicine suppliers",
      "End of month is often cash-tight — beginning of month is better for new spending",
      "Festival months (October, November, March) = peak medicine sales = peak pouch demand",
      "January and July are typically slower — use for relationship building not hard pitching",
      "Align your follow-up timing to their business cycle for maximum receptivity"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Understanding Chemist Business Cycles'?",
        "questionHi": "'केमिस्ट व्यापार चक्र समझना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Chemists have monthly restocking cycles aligned with their medicine suppliers",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Chemists have monthly restocking cycles aligned with their medicine suppliers",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Chemists have monthly restocking cycles aligned with their medicine suppliers",
        "explanationHi": "मुख्य सिद्धांत: Chemists have monthly restocking cycles aligned with their medicine suppliers"
      },
      {
        "questionEn": "In medicine pouch sales, 'Understanding Chemist Business Cycles' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'केमिस्ट व्यापार चक्र समझना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Understanding Chemist Business Cycles'?",
        "questionHi": "'केमिस्ट व्यापार चक्र समझना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'Understanding Chemist Business Cycles':",
        "questionHi": "'केमिस्ट व्यापार चक्र समझना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "End of month is often cash-tight — beginning of month is better for new spending",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "End of month is often cash-tight — beginning of month is better for new spending",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: End of month is often cash-tight — beginning of month is better for new spending",
        "explanationHi": "मुख्य बिंदु 2: End of month is often cash-tight — beginning of month is better for new spending"
      },
      {
        "questionEn": "The final key takeaway from 'Understanding Chemist Business Cycles' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'केमिस्ट व्यापार चक्र समझना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Align your follow-up timing to their business cycle for maximum receptivity",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Align your follow-up timing to their business cycle for maximum receptivity",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Align your follow-up timing to their business cycle for maximum receptivity",
        "explanationHi": "अंतिम सीख: Align your follow-up timing to their business cycle for maximum receptivity"
      }
    ]
  },
  {
    "orderIndex": 92,
    "groupNumber": 14,
    "titleEn": "The Decision Maker Map — Who Actually Says Yes",
    "titleHi": "निर्णय निर्माता मानचित्र",
    "sourceBook": "The Challenger Sale",
    "difficulty": "ADVANCED",
    "estimatedMins": 12,
    "contentEn": "This topic covers The Decision Maker Map — Who Actually Says Yes — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- In family-owned stores: owner decides but spouse often influences budget decisions\n- In partnership stores: one partner handles procurement while other handles operations\n- In chain pharmacies: area manager controls vendor approvals above a threshold\n- In hospital pharmacies: purchase committee approval needed for new vendors\n- Never assume — ask: 'Who else is typically involved in purchasing decisions like this?'\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक निर्णय निर्माता मानचित्र को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- In family-owned stores: owner decides but spouse often influences budget decisions\n- In partnership stores: one partner handles procurement while other handles operations\n- In chain pharmacies: area manager controls vendor approvals above a threshold\n- In hospital pharmacies: purchase committee approval needed for new vendors\n- Never assume — ask: 'Who else is typically involved in purchasing decisions like this?'\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Decision Maker Map in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: In family-owned stores: owner decides but spouse often influences budget decisions\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में निर्णय निर्माता मानचित्र लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: In family-owned stores: owner decides but spouse often influences budget decisions",
    "keyPoints": [
      "In family-owned stores: owner decides but spouse often influences budget decisions",
      "In partnership stores: one partner handles procurement while other handles operations",
      "In chain pharmacies: area manager controls vendor approvals above a threshold",
      "In hospital pharmacies: purchase committee approval needed for new vendors",
      "Never assume — ask: 'Who else is typically involved in purchasing decisions like this?'"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Decision Maker Map'?",
        "questionHi": "'निर्णय निर्माता मानचित्र' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "In family-owned stores: owner decides but spouse often influences budget decisions",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "In family-owned stores: owner decides but spouse often influences budget decisions",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: In family-owned stores: owner decides but spouse often influences budget decisions",
        "explanationHi": "मुख्य सिद्धांत: In family-owned stores: owner decides but spouse often influences budget decisions"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Decision Maker Map' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'निर्णय निर्माता मानचित्र' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Decision Maker Map'?",
        "questionHi": "'निर्णय निर्माता मानचित्र' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'The Decision Maker Map — Who Actually Says Yes':",
        "questionHi": "'निर्णय निर्माता मानचित्र' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "In partnership stores: one partner handles procurement while other handles operations",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "In partnership stores: one partner handles procurement while other handles operations",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: In partnership stores: one partner handles procurement while other handles operations",
        "explanationHi": "मुख्य बिंदु 2: In partnership stores: one partner handles procurement while other handles operations"
      },
      {
        "questionEn": "The final key takeaway from 'The Decision Maker Map — Who Actually Says Yes' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'निर्णय निर्माता मानचित्र' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Never assume — ask: 'Who else is typically involved in purchasing decisions like this?'",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Never assume — ask: 'Who else is typically involved in purchasing decisions like this?'",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Never assume — ask: 'Who else is typically involved in purchasing decisions like this?'",
        "explanationHi": "अंतिम सीख: Never assume — ask: 'Who else is typically involved in purchasing decisions like this?'"
      }
    ]
  },
  {
    "orderIndex": 93,
    "groupNumber": 14,
    "titleEn": "Objection: 'We Already Tried Branded Bags and It Did Not Work'",
    "titleHi": "आपत्ति: 'हमने पहले कोशिश की थी'",
    "sourceBook": "The Challenger Sale",
    "difficulty": "ADVANCED",
    "estimatedMins": 11,
    "contentEn": "This topic covers Objection: 'We Already Tried Branded Bags and It Did Not Work' — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Challenger Sale: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- This is actually valuable information — they have prior experience to build on\n- Ask immediately: 'What did you try? Local printer or a company like ours?'\n- Most prior experiences: poor print quality, wrong size, no branding support\n- Differentiate: 'What we do differently is the design support and quality guarantee'\n- Offer a comparison sample: 'Place our sample next to what you used before and compare'\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक आपत्ति: 'हमने पहले कोशिश की थी' को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Challenger Sale से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- This is actually valuable information — they have prior experience to build on\n- Ask immediately: 'What did you try? Local printer or a company like ours?'\n- Most prior experiences: poor print quality, wrong size, no branding support\n- Differentiate: 'What we do differently is the design support and quality guarantee'\n- Offer a comparison sample: 'Place our sample next to what you used before and compare'\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Objection: 'We Already Tried Branded Bags and It Did Not Work' in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: This is actually valuable information — they have prior experience to build on\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में आपत्ति: 'हमने पहले कोशिश की थी' लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: This is actually valuable information — they have prior experience to build on",
    "keyPoints": [
      "This is actually valuable information — they have prior experience to build on",
      "Ask immediately: 'What did you try? Local printer or a company like ours?'",
      "Most prior experiences: poor print quality, wrong size, no branding support",
      "Differentiate: 'What we do differently is the design support and quality guarantee'",
      "Offer a comparison sample: 'Place our sample next to what you used before and compare'"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Objection: 'We Already Tried Branded Bags and It Did Not Work''?",
        "questionHi": "'आपत्ति: 'हमने पहले कोशिश की थी'' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "This is actually valuable information — they have prior experience to build on",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "This is actually valuable information — they have prior experience to build on",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: This is actually valuable information — they have prior experience to build on",
        "explanationHi": "मुख्य सिद्धांत: This is actually valuable information — they have prior experience to build on"
      },
      {
        "questionEn": "In medicine pouch sales, 'Objection: 'We Already Tried Branded Bags and It Did Not Work'' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपत्ति: 'हमने पहले कोशिश की थी'' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Objection: 'We Already Tried Branded Bags and It Did Not Work''?",
        "questionHi": "'आपत्ति: 'हमने पहले कोशिश की थी'' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Challenger Sale",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Challenger Sale",
        "explanationHi": "स्रोत: The Challenger Sale"
      },
      {
        "questionEn": "Key point 2 of 'Objection: 'We Already Tried Branded Bags and It Did Not Work'':",
        "questionHi": "'आपत्ति: 'हमने पहले कोशिश की थी'' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Ask immediately: 'What did you try? Local printer or a company like ours?'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Ask immediately: 'What did you try? Local printer or a company like ours?'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Ask immediately: 'What did you try? Local printer or a company like ours?'",
        "explanationHi": "मुख्य बिंदु 2: Ask immediately: 'What did you try? Local printer or a company like ours?'"
      },
      {
        "questionEn": "The final key takeaway from 'Objection: 'We Already Tried Branded Bags and It Did Not Work'' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'आपत्ति: 'हमने पहले कोशिश की थी'' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Offer a comparison sample: 'Place our sample next to what you used before and compare'",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Offer a comparison sample: 'Place our sample next to what you used before and compare'",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Offer a comparison sample: 'Place our sample next to what you used before and compare'",
        "explanationHi": "अंतिम सीख: Offer a comparison sample: 'Place our sample next to what you used before and compare'"
      }
    ]
  },
  {
    "orderIndex": 94,
    "groupNumber": 14,
    "titleEn": "The Voice of the Customer — Using Their Words to Close",
    "titleHi": "ग्राहक की आवाज़",
    "sourceBook": "How to Win Friends by Dale Carnegie",
    "difficulty": "ADVANCED",
    "estimatedMins": 10,
    "contentEn": "This topic covers The Voice of the Customer — Using Their Words to Close — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from How to Win Friends by Dale Carnegie: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- The most persuasive pitch uses the customer's own words and concerns back to them\n- During discovery: write down their exact phrases and concerns\n- In closing: 'Earlier you mentioned patients not remembering your name — this solves that exactly'\n- Mirror language: if they say 'value for money', use 'value for money' not 'ROI'\n- People are more convinced by their own words than by yours\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक ग्राहक की आवाज़ को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nHow to Win Friends by Dale Carnegie से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- The most persuasive pitch uses the customer's own words and concerns back to them\n- During discovery: write down their exact phrases and concerns\n- In closing: 'Earlier you mentioned patients not remembering your name — this solves that exactly'\n- Mirror language: if they say 'value for money', use 'value for money' not 'ROI'\n- People are more convinced by their own words than by yours\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Voice of the Customer in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: The most persuasive pitch uses the customer's own words and concerns back to them\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में ग्राहक की आवाज़ लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: The most persuasive pitch uses the customer's own words and concerns back to them",
    "keyPoints": [
      "The most persuasive pitch uses the customer's own words and concerns back to them",
      "During discovery: write down their exact phrases and concerns",
      "In closing: 'Earlier you mentioned patients not remembering your name — this solves that exactly'",
      "Mirror language: if they say 'value for money', use 'value for money' not 'ROI'",
      "People are more convinced by their own words than by yours"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Voice of the Customer'?",
        "questionHi": "'ग्राहक की आवाज़' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "The most persuasive pitch uses the customer's own words and concerns back to them",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "The most persuasive pitch uses the customer's own words and concerns back to them",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: The most persuasive pitch uses the customer's own words and concerns back to them",
        "explanationHi": "मुख्य सिद्धांत: The most persuasive pitch uses the customer's own words and concerns back to them"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Voice of the Customer' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'ग्राहक की आवाज़' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Voice of the Customer'?",
        "questionHi": "'ग्राहक की आवाज़' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "How to Win Friends by Dale Carnegie",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "How to Win Friends by Dale Carnegie",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: How to Win Friends by Dale Carnegie",
        "explanationHi": "स्रोत: How to Win Friends by Dale Carnegie"
      },
      {
        "questionEn": "Key point 2 of 'The Voice of the Customer — Using Their Words to Close':",
        "questionHi": "'ग्राहक की आवाज़' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "During discovery: write down their exact phrases and concerns",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "During discovery: write down their exact phrases and concerns",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: During discovery: write down their exact phrases and concerns",
        "explanationHi": "मुख्य बिंदु 2: During discovery: write down their exact phrases and concerns"
      },
      {
        "questionEn": "The final key takeaway from 'The Voice of the Customer — Using Their Words to Close' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'ग्राहक की आवाज़' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "People are more convinced by their own words than by yours",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "People are more convinced by their own words than by yours",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: People are more convinced by their own words than by yours",
        "explanationHi": "अंतिम सीख: People are more convinced by their own words than by yours"
      }
    ]
  },
  {
    "orderIndex": 95,
    "groupNumber": 14,
    "titleEn": "Building a Daily Sales Habit — The Non-Negotiables",
    "titleHi": "दैनिक बिक्री आदत बनाना",
    "sourceBook": "Psychology of Selling by Brian Tracy",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 10,
    "contentEn": "This topic covers Building a Daily Sales Habit — The Non-Negotiables — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Psychology of Selling by Brian Tracy: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Non-negotiables are daily activities that happen regardless of mood or results\n- Daily non-negotiables: 20 calls, 5 WhatsApp follow-ups, 1 design sent\n- Weekly non-negotiables: territory map review, pipeline scrub, 3 referral asks\n- Monthly non-negotiables: 5 post-delivery check-ins, 2 referral reward deliveries\n- Habits compound: 6 months of daily non-negotiables creates market dominance\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक दैनिक बिक्री आदत बनाना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nPsychology of Selling by Brian Tracy से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Non-negotiables are daily activities that happen regardless of mood or results\n- Daily non-negotiables: 20 calls, 5 WhatsApp follow-ups, 1 design sent\n- Weekly non-negotiables: territory map review, pipeline scrub, 3 referral asks\n- Monthly non-negotiables: 5 post-delivery check-ins, 2 referral reward deliveries\n- Habits compound: 6 months of daily non-negotiables creates market dominance\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Building a Daily Sales Habit in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Non-negotiables are daily activities that happen regardless of mood or results\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में दैनिक बिक्री आदत बनाना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Non-negotiables are daily activities that happen regardless of mood or results",
    "keyPoints": [
      "Non-negotiables are daily activities that happen regardless of mood or results",
      "Daily non-negotiables: 20 calls, 5 WhatsApp follow-ups, 1 design sent",
      "Weekly non-negotiables: territory map review, pipeline scrub, 3 referral asks",
      "Monthly non-negotiables: 5 post-delivery check-ins, 2 referral reward deliveries",
      "Habits compound: 6 months of daily non-negotiables creates market dominance"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Building a Daily Sales Habit'?",
        "questionHi": "'दैनिक बिक्री आदत बनाना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Non-negotiables are daily activities that happen regardless of mood or results",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Non-negotiables are daily activities that happen regardless of mood or results",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Non-negotiables are daily activities that happen regardless of mood or results",
        "explanationHi": "मुख्य सिद्धांत: Non-negotiables are daily activities that happen regardless of mood or results"
      },
      {
        "questionEn": "In medicine pouch sales, 'Building a Daily Sales Habit' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'दैनिक बिक्री आदत बनाना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Building a Daily Sales Habit'?",
        "questionHi": "'दैनिक बिक्री आदत बनाना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Psychology of Selling by Brian Tracy",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Psychology of Selling by Brian Tracy",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Psychology of Selling by Brian Tracy",
        "explanationHi": "स्रोत: Psychology of Selling by Brian Tracy"
      },
      {
        "questionEn": "Key point 2 of 'Building a Daily Sales Habit — The Non-Negotiables':",
        "questionHi": "'दैनिक बिक्री आदत बनाना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Daily non-negotiables: 20 calls, 5 WhatsApp follow-ups, 1 design sent",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Daily non-negotiables: 20 calls, 5 WhatsApp follow-ups, 1 design sent",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Daily non-negotiables: 20 calls, 5 WhatsApp follow-ups, 1 design sent",
        "explanationHi": "मुख्य बिंदु 2: Daily non-negotiables: 20 calls, 5 WhatsApp follow-ups, 1 design sent"
      },
      {
        "questionEn": "The final key takeaway from 'Building a Daily Sales Habit — The Non-Negotiables' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'दैनिक बिक्री आदत बनाना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Habits compound: 6 months of daily non-negotiables creates market dominance",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Habits compound: 6 months of daily non-negotiables creates market dominance",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Habits compound: 6 months of daily non-negotiables creates market dominance",
        "explanationHi": "अंतिम सीख: Habits compound: 6 months of daily non-negotiables creates market dominance"
      }
    ]
  },
  {
    "orderIndex": 96,
    "groupNumber": 14,
    "titleEn": "Handling Silence After Sending a Sample",
    "titleHi": "सैम्पल भेजने के बाद चुप्पी संभालना",
    "sourceBook": "Fanatical Prospecting by Jeb Blount",
    "difficulty": "INTERMEDIATE",
    "estimatedMins": 9,
    "contentEn": "This topic covers Handling Silence After Sending a Sample — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Fanatical Prospecting by Jeb Blount: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Silence after sample = they are busy, not uninterested — follow up consistently\n- Day 3 rule: WhatsApp if no response after 3 days\n- Day 7 rule: voice note if no WhatsApp response after 7 days\n- Day 10 rule: call if still no response after 10 days\n- After 3 follow-ups with no response: archive them for 30-day re-engagement\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक सैम्पल भेजने के बाद चुप्पी संभालना को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nFanatical Prospecting by Jeb Blount से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Silence after sample = they are busy, not uninterested — follow up consistently\n- Day 3 rule: WhatsApp if no response after 3 days\n- Day 7 rule: voice note if no WhatsApp response after 7 days\n- Day 10 rule: call if still no response after 10 days\n- After 3 follow-ups with no response: archive them for 30-day re-engagement\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Handling Silence After Sending a Sample in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Silence after sample = they are busy, not uninterested — follow up consistently\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में सैम्पल भेजने के बाद चुप्पी संभालना लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Silence after sample = they are busy, not uninterested — follow up consistently",
    "keyPoints": [
      "Silence after sample = they are busy, not uninterested — follow up consistently",
      "Day 3 rule: WhatsApp if no response after 3 days",
      "Day 7 rule: voice note if no WhatsApp response after 7 days",
      "Day 10 rule: call if still no response after 10 days",
      "After 3 follow-ups with no response: archive them for 30-day re-engagement"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Handling Silence After Sending a Sample'?",
        "questionHi": "'सैम्पल भेजने के बाद चुप्पी संभालना' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Silence after sample = they are busy, not uninterested — follow up consistently",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Silence after sample = they are busy, not uninterested — follow up consistently",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Silence after sample = they are busy, not uninterested — follow up consistently",
        "explanationHi": "मुख्य सिद्धांत: Silence after sample = they are busy, not uninterested — follow up consistently"
      },
      {
        "questionEn": "In medicine pouch sales, 'Handling Silence After Sending a Sample' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'सैम्पल भेजने के बाद चुप्पी संभालना' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Handling Silence After Sending a Sample'?",
        "questionHi": "'सैम्पल भेजने के बाद चुप्पी संभालना' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Fanatical Prospecting by Jeb Blount",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Fanatical Prospecting by Jeb Blount",
        "explanationHi": "स्रोत: Fanatical Prospecting by Jeb Blount"
      },
      {
        "questionEn": "Key point 2 of 'Handling Silence After Sending a Sample':",
        "questionHi": "'सैम्पल भेजने के बाद चुप्पी संभालना' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Day 3 rule: WhatsApp if no response after 3 days",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Day 3 rule: WhatsApp if no response after 3 days",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Day 3 rule: WhatsApp if no response after 3 days",
        "explanationHi": "मुख्य बिंदु 2: Day 3 rule: WhatsApp if no response after 3 days"
      },
      {
        "questionEn": "The final key takeaway from 'Handling Silence After Sending a Sample' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'सैम्पल भेजने के बाद चुप्पी संभालना' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "After 3 follow-ups with no response: archive them for 30-day re-engagement",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "After 3 follow-ups with no response: archive them for 30-day re-engagement",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: After 3 follow-ups with no response: archive them for 30-day re-engagement",
        "explanationHi": "अंतिम सीख: After 3 follow-ups with no response: archive them for 30-day re-engagement"
      }
    ]
  },
  {
    "orderIndex": 97,
    "groupNumber": 14,
    "titleEn": "The Decision Urgency Trigger",
    "titleHi": "निर्णय तात्कालिकता ट्रिगर",
    "sourceBook": "Influence by Robert Cialdini",
    "difficulty": "ADVANCED",
    "estimatedMins": 9,
    "contentEn": "This topic covers The Decision Urgency Trigger — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Influence by Robert Cialdini: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Urgency trigger: something changes that makes delay more costly than deciding\n- Rate revision trigger: 'Our paper costs are increasing next month — current rate locked till Friday'\n- Batch trigger: 'We have 3 slots left in this production batch — first come served'\n- Festival trigger: 'Orders placed before the 15th will be delivered before Diwali'\n- Competition trigger: 'Two stores in your market confirmed this week — just wanted to offer you first'\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक निर्णय तात्कालिकता ट्रिगर को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nInfluence by Robert Cialdini से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Urgency trigger: something changes that makes delay more costly than deciding\n- Rate revision trigger: 'Our paper costs are increasing next month — current rate locked till Friday'\n- Batch trigger: 'We have 3 slots left in this production batch — first come served'\n- Festival trigger: 'Orders placed before the 15th will be delivered before Diwali'\n- Competition trigger: 'Two stores in your market confirmed this week — just wanted to offer you first'\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Decision Urgency Trigger in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Urgency trigger: something changes that makes delay more costly than deciding\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में निर्णय तात्कालिकता ट्रिगर लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Urgency trigger: something changes that makes delay more costly than deciding",
    "keyPoints": [
      "Urgency trigger: something changes that makes delay more costly than deciding",
      "Rate revision trigger: 'Our paper costs are increasing next month — current rate locked till Friday'",
      "Batch trigger: 'We have 3 slots left in this production batch — first come served'",
      "Festival trigger: 'Orders placed before the 15th will be delivered before Diwali'",
      "Competition trigger: 'Two stores in your market confirmed this week — just wanted to offer you first'"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Decision Urgency Trigger'?",
        "questionHi": "'निर्णय तात्कालिकता ट्रिगर' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Urgency trigger: something changes that makes delay more costly than deciding",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Urgency trigger: something changes that makes delay more costly than deciding",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Urgency trigger: something changes that makes delay more costly than deciding",
        "explanationHi": "मुख्य सिद्धांत: Urgency trigger: something changes that makes delay more costly than deciding"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Decision Urgency Trigger' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'निर्णय तात्कालिकता ट्रिगर' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Decision Urgency Trigger'?",
        "questionHi": "'निर्णय तात्कालिकता ट्रिगर' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Influence by Robert Cialdini",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Influence by Robert Cialdini",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Influence by Robert Cialdini",
        "explanationHi": "स्रोत: Influence by Robert Cialdini"
      },
      {
        "questionEn": "Key point 2 of 'The Decision Urgency Trigger':",
        "questionHi": "'निर्णय तात्कालिकता ट्रिगर' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Rate revision trigger: 'Our paper costs are increasing next month — current rate locked till Friday'",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Rate revision trigger: 'Our paper costs are increasing next month — current rate locked till Friday'",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Rate revision trigger: 'Our paper costs are increasing next month — current rate locked till Friday'",
        "explanationHi": "मुख्य बिंदु 2: Rate revision trigger: 'Our paper costs are increasing next month — current rate locked till Friday'"
      },
      {
        "questionEn": "The final key takeaway from 'The Decision Urgency Trigger' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'निर्णय तात्कालिकता ट्रिगर' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Competition trigger: 'Two stores in your market confirmed this week — just wanted to offer you first'",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Competition trigger: 'Two stores in your market confirmed this week — just wanted to offer you first'",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Competition trigger: 'Two stores in your market confirmed this week — just wanted to offer you first'",
        "explanationHi": "अंतिम सीख: Competition trigger: 'Two stores in your market confirmed this week — just wanted to offer you first'"
      }
    ]
  },
  {
    "orderIndex": 98,
    "groupNumber": 14,
    "titleEn": "Pharmacy Owner Psychology — What Drives Their Decisions",
    "titleHi": "फार्मेसी मालिक का मनोविज्ञान",
    "sourceBook": "Thinking Fast and Slow by Daniel Kahneman",
    "difficulty": "ADVANCED",
    "estimatedMins": 13,
    "contentEn": "This topic covers Pharmacy Owner Psychology — What Drives Their Decisions — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from Thinking Fast and Slow by Daniel Kahneman: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- Pharmacy owners are predominantly System 2 thinkers — deliberate, analytical\n- They need time to process — rushed closes backfire, thoughtful follow-ups win\n- Pride drives many decisions: 'This will make my store look more professional' works\n- Risk aversion is high: minimize perceived risk with samples, guarantees, COD terms\n- Social comparison motivates: knowing nearby competitors ordered activates urgency\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक फार्मेसी मालिक का मनोविज्ञान को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThinking Fast and Slow by Daniel Kahneman से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- Pharmacy owners are predominantly System 2 thinkers — deliberate, analytical\n- They need time to process — rushed closes backfire, thoughtful follow-ups win\n- Pride drives many decisions: 'This will make my store look more professional' works\n- Risk aversion is high: minimize perceived risk with samples, guarantees, COD terms\n- Social comparison motivates: knowing nearby competitors ordered activates urgency\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Pharmacy Owner Psychology in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: Pharmacy owners are predominantly System 2 thinkers — deliberate, analytical\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में फार्मेसी मालिक का मनोविज्ञान लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: Pharmacy owners are predominantly System 2 thinkers — deliberate, analytical",
    "keyPoints": [
      "Pharmacy owners are predominantly System 2 thinkers — deliberate, analytical",
      "They need time to process — rushed closes backfire, thoughtful follow-ups win",
      "Pride drives many decisions: 'This will make my store look more professional' works",
      "Risk aversion is high: minimize perceived risk with samples, guarantees, COD terms",
      "Social comparison motivates: knowing nearby competitors ordered activates urgency"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Pharmacy Owner Psychology'?",
        "questionHi": "'फार्मेसी मालिक का मनोविज्ञान' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "Pharmacy owners are predominantly System 2 thinkers — deliberate, analytical",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "Pharmacy owners are predominantly System 2 thinkers — deliberate, analytical",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: Pharmacy owners are predominantly System 2 thinkers — deliberate, analytical",
        "explanationHi": "मुख्य सिद्धांत: Pharmacy owners are predominantly System 2 thinkers — deliberate, analytical"
      },
      {
        "questionEn": "In medicine pouch sales, 'Pharmacy Owner Psychology' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'फार्मेसी मालिक का मनोविज्ञान' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Pharmacy Owner Psychology'?",
        "questionHi": "'फार्मेसी मालिक का मनोविज्ञान' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "Thinking Fast and Slow by Daniel Kahneman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "Thinking Fast and Slow by Daniel Kahneman",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: Thinking Fast and Slow by Daniel Kahneman",
        "explanationHi": "स्रोत: Thinking Fast and Slow by Daniel Kahneman"
      },
      {
        "questionEn": "Key point 2 of 'Pharmacy Owner Psychology — What Drives Their Decisions':",
        "questionHi": "'फार्मेसी मालिक का मनोविज्ञान' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "They need time to process — rushed closes backfire, thoughtful follow-ups win",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "They need time to process — rushed closes backfire, thoughtful follow-ups win",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: They need time to process — rushed closes backfire, thoughtful follow-ups win",
        "explanationHi": "मुख्य बिंदु 2: They need time to process — rushed closes backfire, thoughtful follow-ups win"
      },
      {
        "questionEn": "The final key takeaway from 'Pharmacy Owner Psychology — What Drives Their Decisions' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'फार्मेसी मालिक का मनोविज्ञान' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Social comparison motivates: knowing nearby competitors ordered activates urgency",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Social comparison motivates: knowing nearby competitors ordered activates urgency",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Social comparison motivates: knowing nearby competitors ordered activates urgency",
        "explanationHi": "अंतिम सीख: Social comparison motivates: knowing nearby competitors ordered activates urgency"
      }
    ]
  },
  {
    "orderIndex": 99,
    "groupNumber": 15,
    "titleEn": "The Perfect Pitch — Putting It All Together",
    "titleHi": "परफेक्ट पिच — सब एक साथ",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "PRO",
    "estimatedMins": 15,
    "contentEn": "This topic covers The Perfect Pitch — Putting It All Together — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Sales Bible by Jeffrey Gitomer: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- The perfect pitch is not a speech — it is a guided conversation with 5 checkpoints\n- Checkpoint 1: Rapport established in the first 30 seconds\n- Checkpoint 2: Their world understood through 2 to 3 strategic questions\n- Checkpoint 3: Value connected to their specific pain point or ambition\n- Checkpoint 4: Objections surfaced and resolved using the techniques from this course\n- Checkpoint 5: Next step agreed upon — design proof, follow-up call, or confirmed order\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक परफेक्ट पिच — सब एक साथ को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Sales Bible by Jeffrey Gitomer से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- The perfect pitch is not a speech — it is a guided conversation with 5 checkpoints\n- Checkpoint 1: Rapport established in the first 30 seconds\n- Checkpoint 2: Their world understood through 2 to 3 strategic questions\n- Checkpoint 3: Value connected to their specific pain point or ambition\n- Checkpoint 4: Objections surfaced and resolved using the techniques from this course\n- Checkpoint 5: Next step agreed upon — design proof, follow-up call, or confirmed order\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying The Perfect Pitch in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: The perfect pitch is not a speech — it is a guided conversation with 5 checkpoints\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में परफेक्ट पिच लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: The perfect pitch is not a speech — it is a guided conversation with 5 checkpoints",
    "keyPoints": [
      "The perfect pitch is not a speech — it is a guided conversation with 5 checkpoints",
      "Checkpoint 1: Rapport established in the first 30 seconds",
      "Checkpoint 2: Their world understood through 2 to 3 strategic questions",
      "Checkpoint 3: Value connected to their specific pain point or ambition",
      "Checkpoint 4: Objections surfaced and resolved using the techniques from this course",
      "Checkpoint 5: Next step agreed upon — design proof, follow-up call, or confirmed order"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'The Perfect Pitch'?",
        "questionHi": "'परफेक्ट पिच' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "The perfect pitch is not a speech — it is a guided conversation with 5 checkpoints",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "The perfect pitch is not a speech — it is a guided conversation with 5 checkpoints",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: The perfect pitch is not a speech — it is a guided conversation with 5 checkpoints",
        "explanationHi": "मुख्य सिद्धांत: The perfect pitch is not a speech — it is a guided conversation with 5 checkpoints"
      },
      {
        "questionEn": "In medicine pouch sales, 'The Perfect Pitch' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'परफेक्ट पिच' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'The Perfect Pitch'?",
        "questionHi": "'परफेक्ट पिच' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Sales Bible by Jeffrey Gitomer",
        "explanationHi": "स्रोत: The Sales Bible by Jeffrey Gitomer"
      },
      {
        "questionEn": "Key point 2 of 'The Perfect Pitch — Putting It All Together':",
        "questionHi": "'परफेक्ट पिच — सब एक साथ' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "Checkpoint 1: Rapport established in the first 30 seconds",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "Checkpoint 1: Rapport established in the first 30 seconds",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: Checkpoint 1: Rapport established in the first 30 seconds",
        "explanationHi": "मुख्य बिंदु 2: Checkpoint 1: Rapport established in the first 30 seconds"
      },
      {
        "questionEn": "The final key takeaway from 'The Perfect Pitch — Putting It All Together' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'परफेक्ट पिच — सब एक साथ' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Checkpoint 5: Next step agreed upon — design proof, follow-up call, or confirmed order",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Checkpoint 5: Next step agreed upon — design proof, follow-up call, or confirmed order",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Checkpoint 5: Next step agreed upon — design proof, follow-up call, or confirmed order",
        "explanationHi": "अंतिम सीख: Checkpoint 5: Next step agreed upon — design proof, follow-up call, or confirmed order"
      }
    ]
  },
  {
    "orderIndex": 100,
    "groupNumber": 15,
    "titleEn": "Your Sales Journey — From Beginner to Pro in 100 Topics",
    "titleHi": "आपकी बिक्री यात्रा",
    "sourceBook": "The Sales Bible by Jeffrey Gitomer",
    "difficulty": "PRO",
    "estimatedMins": 20,
    "contentEn": "This topic covers Your Sales Journey — From Beginner to Pro in 100 Topics — a critical sales skill adapted for medicine pouch selling.\n\nThe core principle from The Sales Bible by Jeffrey Gitomer: Understanding and applying this concept transforms how you engage with chemists and close deals.\n\nKey Concepts:\n- You have now covered 100 sales topics from opening a cold call to executive selling\n- The difference between knowing and applying is daily deliberate practice\n- Start with 3 topics: master your opening, your follow-up, and one key objection\n- Track your conversion rate monthly: it will improve with consistent application\n- Sales is the only skill where getting better directly and immediately increases your income\n\nApplication to Medicine Pouch Sales:\nWhen selling 5000-piece minimum orders of branded multicolor medicine pouches to chemists, this technique directly addresses the most common barriers: trust, price perception, objection handling, and follow-up discipline.\n\nThe successful application of this concept means: chemists who would have said no become prospects, prospects become customers, and customers become advocates who refer other stores.\n\nRemember: Every interaction with a chemist is an opportunity to demonstrate not just product value, but professional, consultative sales expertise.",
    "contentHi": "यह टॉपिक आपकी बिक्री यात्रा को कवर करता है — मेडिसिन पाउच बिक्री के लिए अनुकूलित एक महत्वपूर्ण बिक्री कौशल।\n\nThe Sales Bible by Jeffrey Gitomer से मुख्य सिद्धांत: इस अवधारणा को समझना और लागू करना आपके केमिस्ट के साथ जुड़ाव और डील बंद करने के तरीके को बदल देता है।\n\nमुख्य बिंदु:\n- You have now covered 100 sales topics from opening a cold call to executive selling\n- The difference between knowing and applying is daily deliberate practice\n- Start with 3 topics: master your opening, your follow-up, and one key objection\n- Track your conversion rate monthly: it will improve with consistent application\n- Sales is the only skill where getting better directly and immediately increases your income\n\nमेडिसिन पाउच सेल्स में अनुप्रयोग:\nयह तकनीक सीधे सबसे आम बाधाओं को संबोधित करती है: विश्वास, मूल्य धारणा, आपत्ति संभालना और फॉलो-अप अनुशासन।",
    "scriptEn": "Applying Your Sales Journey in a medicine pouch call:\n\nYou: \"Hello sir, I'm calling from RarePrint about branded medicine pouches.\"\n\n[Apply the core technique from this topic]\n\nThe key insight: You have now covered 100 sales topics from opening a cold call to executive selling\n\nThis approach naturally leads the conversation toward trust, value demonstration, and ultimately — the order for 5000 branded medicine pouches that will put the chemist's pharmacy name in every patient's home.",
    "scriptHi": "मेडिसिन पाउच कॉल में आपकी बिक्री यात्रा लागू करना:\n\nआप: \"नमस्ते सर, मैं RarePrint से ब्रांडेड मेडिसिन पाउच के बारे में कॉल कर रहा हूँ।\"\n\n[इस टॉपिक की मुख्य तकनीक लागू करें]\n\nमुख्य अंतर्दृष्टि: You have now covered 100 sales topics from opening a cold call to executive selling",
    "keyPoints": [
      "You have now covered 100 sales topics from opening a cold call to executive selling",
      "The difference between knowing and applying is daily deliberate practice",
      "Start with 3 topics: master your opening, your follow-up, and one key objection",
      "Track your conversion rate monthly: it will improve with consistent application",
      "Sales is the only skill where getting better directly and immediately increases your income"
    ],
    "questions": [
      {
        "questionEn": "What is the core principle of 'Your Sales Journey'?",
        "questionHi": "'आपकी बिक्री यात्रा' का मुख्य सिद्धांत क्या है?",
        "options": {
          "en": [
            "You have now covered 100 sales topics from opening a cold call to executive selling",
            "Always offer a discount first",
            "Lead with product features",
            "Call twice per day"
          ],
          "hi": [
            "You have now covered 100 sales topics from opening a cold call to executive selling",
            "पहले हमेशा डिस्काउंट दें",
            "प्रोडक्ट फीचर से शुरू करें",
            "दिन में दो बार कॉल करें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Core principle: You have now covered 100 sales topics from opening a cold call to executive selling",
        "explanationHi": "मुख्य सिद्धांत: You have now covered 100 sales topics from opening a cold call to executive selling"
      },
      {
        "questionEn": "In medicine pouch sales, 'Your Sales Journey' is MOST useful when:",
        "questionHi": "मेडिसिन पाउच सेल्स में 'आपकी बिक्री यात्रा' सबसे उपयोगी है जब:",
        "options": {
          "en": [
            "The chemist is already a customer",
            "Facing resistance or building initial trust with a new chemist",
            "Processing orders",
            "Designing the pouch"
          ],
          "hi": [
            "केमिस्ट पहले से ग्राहक है",
            "एक नए केमिस्ट के साथ प्रतिरोध का सामना करते समय",
            "ऑर्डर प्रोसेस करते समय",
            "पाउच डिज़ाइन करते समय"
          ]
        },
        "correctIndex": 1,
        "explanationEn": "This technique is most valuable during the selling process with new prospects.",
        "explanationHi": "यह तकनीक नए prospects के साथ बिक्री प्रक्रिया के दौरान सबसे मूल्यवान है।"
      },
      {
        "questionEn": "Which book is the source of 'Your Sales Journey'?",
        "questionHi": "'आपकी बिक्री यात्रा' का स्रोत कौन सी किताब है?",
        "options": {
          "en": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ],
          "hi": [
            "The Sales Bible by Jeffrey Gitomer",
            "The Lean Startup",
            "Rich Dad Poor Dad",
            "7 Habits of Highly Effective People"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Source: The Sales Bible by Jeffrey Gitomer",
        "explanationHi": "स्रोत: The Sales Bible by Jeffrey Gitomer"
      },
      {
        "questionEn": "Key point 2 of 'Your Sales Journey — From Beginner to Pro in 100 Topics':",
        "questionHi": "'आपकी बिक्री यात्रा' का मुख्य बिंदु 2:",
        "options": {
          "en": [
            "The difference between knowing and applying is daily deliberate practice",
            "Memorize product specs",
            "Always give free samples",
            "Avoid difficult customers"
          ],
          "hi": [
            "The difference between knowing and applying is daily deliberate practice",
            "प्रोडक्ट स्पेक याद करें",
            "हमेशा मुफ्त सैम्पल दें",
            "कठिन ग्राहकों से बचें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Key point 2: The difference between knowing and applying is daily deliberate practice",
        "explanationHi": "मुख्य बिंदु 2: The difference between knowing and applying is daily deliberate practice"
      },
      {
        "questionEn": "The final key takeaway from 'Your Sales Journey — From Beginner to Pro in 100 Topics' for medicine pouch sales is:",
        "questionHi": "मेडिसिन पाउच सेल्स के लिए 'आपकी बिक्री यात्रा' से अंतिम मुख्य सीख है:",
        "options": {
          "en": [
            "Sales is the only skill where getting better directly and immediately increases your income",
            "Always match competitor pricing",
            "Avoid following up more than once",
            "Focus only on large orders"
          ],
          "hi": [
            "Sales is the only skill where getting better directly and immediately increases your income",
            "हमेशा प्रतिस्पर्धी मूल्य मिलाएं",
            "एक बार से अधिक फॉलो-अप से बचें",
            "केवल बड़े ऑर्डर पर ध्यान दें"
          ]
        },
        "correctIndex": 0,
        "explanationEn": "Final takeaway: Sales is the only skill where getting better directly and immediately increases your income",
        "explanationHi": "अंतिम सीख: Sales is the only skill where getting better directly and immediately increases your income"
      }
    ]
  }
]

async function main() {
  console.log('Seeding Sales Learning topics...')
  
  let topicsCreated = 0
  let questionsCreated = 0

  for (const topic of TOPICS) {
    const { questions, keyPoints, ...topicData } = topic
    
    const created = await prisma.salesTopic.upsert({
      where: { orderIndex: topicData.orderIndex },
      update: {
        ...topicData,
        keyPoints: keyPoints,
        isActive: true,
      },
      create: {
        ...topicData,
        keyPoints: keyPoints,
        isActive: true,
      }
    })
    
    topicsCreated++
    
    // Delete existing questions and recreate
    await prisma.topicQuestion.deleteMany({ where: { topicId: created.id } })
    
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      await prisma.topicQuestion.create({
        data: {
          topicId: created.id,          questionEn: q.questionEn,
          questionHi: q.questionHi,
          options: q.options,
          correctIndex: q.correctIndex,
          explanationEn: q.explanationEn,
          explanationHi: q.explanationHi,
        }
      })
      questionsCreated++
    }
    
    if (topicsCreated % 10 === 0) {
      console.log(`  Created ${topicsCreated} topics...`)
    }
  }
  
  console.log(`\nDone! Created ${topicsCreated} topics and ${questionsCreated} questions.`)
  
  // Also create MilestoneTests for each group
  const maxGroup = Math.max(...TOPICS.map((t: any) => t.groupNumber))
  console.log(`\nCreating ${maxGroup} milestone tests...`)
  
  for (let g = 1; g <= maxGroup; g++) {
    const groupTopics = TOPICS.filter((t: any) => t.groupNumber === g)
    const lastTopic = groupTopics[groupTopics.length - 1]
    
    await prisma.milestoneTest.upsert({
      where: { groupNumber: g },
      update: {
        titleEn: `Group ${g} Milestone Test`,
        titleHi: `ग्रुप ${g} माइलस्टोन टेस्ट`,        groupNumber: g,        totalMarks: 200,
        isActive: true,
      },
      create: {
        titleEn: `Group ${g} Milestone Test`,
        titleHi: `ग्रुप ${g} माइलस्टोन टेस्ट`,        groupNumber: g,        totalMarks: 200,
        isActive: true,
      }
    })
  }
  
  console.log('Milestone tests created!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())