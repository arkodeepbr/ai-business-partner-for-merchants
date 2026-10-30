export type SaathiPage =
  | "overview"
  | "sales"
  | "cashflow"
  | "customers"
  | "inventory"
  | "loans"
  | "reports"
  | "notifications"
  | "support"
  | "settings"
  | "assistant";

export type SaathiCommandResult = {
  page: SaathiPage;
  answer: string;
  needsConnectedData?: boolean;
};

const matches = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

/** A small, deterministic voice and text command layer for safe UI navigation. */
export function interpretSaathiCommand(input: string, locale: "en" | "hi"): SaathiCommandResult {
  const text = input.trim().toLocaleLowerCase();
  const hi = locale === "hi";

  if (matches(text, ["overview", "home", "dashboard", "मुख्य", "होम", "डैशबोर्ड"])) {
    return { page: "overview", answer: hi ? "मैंने आपका व्यवसाय डैशबोर्ड खोल दिया है। असली आंकड़े देखने के लिए अधिकृत Paytm खाते का कनेक्शन ज़रूरी है।" : "I opened your business overview. Real figures will appear after your authorized Paytm account is connected." };
  }
  if (matches(text, ["sale", "sales", "collection", "payment", "transaction", "बिक्री", "पेमेंट", "कलेक्शन", "आज कितना", "कितनी बिक्री"])) {
    return { page: "sales", needsConnectedData: true, answer: hi ? "मैंने Sales insights खोला है। अभी कोई merchant account जुड़ा नहीं है, इसलिए मैं बिक्री की रकम या transaction नहीं बता सकता।" : "I opened Sales insights. No merchant account is connected yet, so I can’t report sales amounts or transactions." };
  }
  if (matches(text, ["cash flow", "cashflow", "settlement", "settle", "payout", "निपटान", "सेटलमेंट", "कैश फ्लो"])) {
    return { page: "cashflow", needsConnectedData: true, answer: hi ? "Cash flow खोला है। Settlement का live data अभी shared API में उपलब्ध नहीं है।" : "I opened Cash flow. Live settlement data isn’t available in the shared API yet." };
  }
  if (matches(text, ["stock", "inventory", "reorder", "supplier", "purchase order", "staff", "shift", "स्टॉक", "इन्वेंटरी", "कर्मचारी", "आर्डर"])) {
    return { page: "inventory", needsConnectedData: true, answer: hi ? "Stock & staff खोला है। Stock records और order tools अभी backend से जुड़े नहीं हैं, इसलिए मैंने कोई order नहीं बनाया।" : "I opened Stock & staff. Stock records and ordering tools aren’t connected to the backend yet, so I haven’t created an order." };
  }
  if (matches(text, ["customer", "loyalty", "campaign", "review", "ग्राहक", "लॉयल्टी", "कैम्पेन"])) {
    return { page: "customers", needsConnectedData: true, answer: hi ? "Customers खोला है। Customer consent और campaign services अभी connected नहीं हैं; मैंने कोई message नहीं भेजा।" : "I opened Customers. Customer consent and campaign services aren’t connected yet; I haven’t sent any messages." };
  }
  if (matches(text, ["loan", "credit", "borrow", "working capital", "लोन", "ऋण", "क्रेडिट"])) {
    return { page: "loans", needsConnectedData: true, answer: hi ? "Credit खोला है। कोई authorized lending partner जुड़ा नहीं है, इसलिए मैं offer या eligibility का दावा नहीं कर सकता।" : "I opened Credit. No authorized lending partner is connected, so I can’t claim an offer or eligibility." };
  }
  if (matches(text, ["gst", "tax", "filing", "invoice", "रिपोर्ट", "जीएसटी", "टैक्स"])) {
    return { page: "reports", needsConnectedData: true, answer: hi ? "Reports खोला है। GST और tax documents अभी उपलब्ध नहीं हैं; यह tax advice या filing नहीं है।" : "I opened Reports. GST and tax documents aren’t connected yet; this isn’t tax advice or a filing." };
  }
  if (matches(text, ["notification", "alert", "reminder", "सूचना", "अलर्ट"])) {
    return { page: "notifications", answer: hi ? "Notifications खोला है। Alerts तभी दिखेंगे जब notification service connect होगी।" : "I opened Notifications. Alerts will appear when the notification service is connected." };
  }
  if (matches(text, ["support", "help me", "human", "agent", "सहायता", "मदद", "इंसान"])) {
    return { page: "support", answer: hi ? "मैंने Support खोला है। Support ticket भेजने की service अभी उपलब्ध नहीं है।" : "I opened Support. The support-ticket service isn’t available yet." };
  }
  if (matches(text, ["setting", "privacy", "language", "सेटिंग", "भाषा", "गोपनीयता"])) {
    return { page: "settings", answer: hi ? "मैंने Settings खोला है। ऊपर से English या हिन्दी चुन सकते हैं।" : "I opened Settings. You can switch between English and Hindi from the language control above." };
  }

  return {
    page: "assistant",
    answer: hi
      ? "मैं typed और voice commands से app के sections खोल सकता हूँ। Sales, settlements, credit, stock, customers और tax के live काम के लिए authorized Paytm data और संबंधित service APIs जोड़नी होंगी।"
      : "I can open product areas with typed or voice commands. Live work for sales, settlements, credit, stock, customers and tax needs authorized Paytm data and the matching service APIs.",
  };
}
