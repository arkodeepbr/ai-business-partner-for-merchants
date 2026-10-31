import type { Locale } from "@/lib/locale";

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
export function interpretSaathiCommand(input: string, locale: Locale): SaathiCommandResult {
  const text = input.trim().toLocaleLowerCase();
  const hi = locale === "hi";
  const kn = locale === "kn";

  if (matches(text, ["overview", "home", "dashboard", "मुख्य", "होम", "डैशबोर्ड"])) {
    return { page: "overview", answer: hi ? "मैंने आपका व्यवसाय डैशबोर्ड खोल दिया है। असली आंकड़े देखने के लिए अधिकृत Paytm खाते का कनेक्शन ज़रूरी है।" : kn ? "ನಿಮ್ಮ ವ್ಯಾಪಾರ ಅವಲೋಕನವನ್ನು ತೆರೆದಿದ್ದೇನೆ. ನೈಜ ಅಂಕಿಅಂಶಗಳಿಗೆ ಅಧಿಕೃತ Paytm ಖಾತೆಯನ್ನು ಸಂಪರ್ಕಿಸಬೇಕು." : "I opened your business overview. Real figures will appear after your authorized Paytm account is connected." };
  }
  if (matches(text, ["sale", "sales", "collection", "payment", "transaction", "बिक्री", "पेमेंट", "कलेक्शन", "आज कितना", "कितनी बिक्री"])) {
    return { page: "sales", needsConnectedData: true, answer: hi ? "मैंने Sales insights खोला है। अभी कोई merchant account जुड़ा नहीं है, इसलिए मैं बिक्री की रकम या transaction नहीं बता सकता।" : kn ? "ಮಾರಾಟದ ಒಳನೋಟಗಳನ್ನು ತೆರೆದಿದ್ದೇನೆ. ಇನ್ನೂ ವ್ಯಾಪಾರಿ ಖಾತೆ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ, ಆದ್ದರಿಂದ ಮಾರಾಟದ ಮೊತ್ತ ಅಥವಾ ವ್ಯವಹಾರಗಳನ್ನು ಹೇಳಲು ಸಾಧ್ಯವಿಲ್ಲ." : "I opened Sales insights. No merchant account is connected yet, so I can’t report sales amounts or transactions." };
  }
  if (matches(text, ["cash flow", "cashflow", "settlement", "settle", "payout", "निपटान", "सेटलमेंट", "कैश फ्लो"])) {
    return { page: "cashflow", needsConnectedData: true, answer: hi ? "Cash flow खोला है। Settlement का live data अभी shared API में उपलब्ध नहीं है।" : kn ? "ನಗದು ಹರಿವನ್ನು ತೆರೆದಿದ್ದೇನೆ. ನೇರ ಸೆಟ್ಲ್‌ಮೆಂಟ್ ಮಾಹಿತಿ ಇನ್ನೂ ಹಂಚಿದ APIಯಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ." : "I opened Cash flow. Live settlement data isn’t available in the shared API yet." };
  }
  if (matches(text, ["stock", "inventory", "reorder", "supplier", "purchase order", "staff", "shift", "स्टॉक", "इन्वेंटरी", "कर्मचारी", "आर्डर", "ದಾಸ್ತಾನು", "ಸಿಬ್ಬಂದಿ", "ಖರೀದಿ ಆರ್ಡರ್"])) {
    return { page: "inventory", needsConnectedData: false, answer: hi ? "स्टॉक और लाभ पेज खोला है। आप उत्पाद, खरीद लागत, बिक्री मूल्य, मात्रा, बिक्री और खर्च अपने खाते में दर्ज कर सकते हैं। लाभ और बिक्री लक्ष्य का अनुमान देखने के लिए Saathi guidance चुनें।" : kn ? "ಸ್ಟಾಕ್ ಮತ್ತು ಲಾಭ ಪುಟವನ್ನು ತೆರೆದಿದ್ದೇನೆ. ಉತ್ಪನ್ನಗಳು, ವೆಚ್ಚ, ಮಾರಾಟ ಬೆಲೆ, ಪ್ರಮಾಣ, ಮಾರಾಟ ಮತ್ತು ಖರ್ಚುಗಳನ್ನು ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ದಾಖಲಿಸಬಹುದು. ಲಾಭ ಮತ್ತು ಮಾರಾಟ ಗುರಿಯ ಅಂದಾಜಿಗೆ Saathi ಮಾರ್ಗದರ್ಶನ ಆಯ್ಕೆಮಾಡಿ." : "I opened Stock & profit. You can save products, costs, selling prices, quantities, sales and expenses to your account. Choose Saathi guidance for a profit estimate and suggested sales target." };
  }
  if (matches(text, ["customer", "loyalty", "campaign", "review", "ग्राहक", "लॉयल्टी", "कैम्पेन", "ಗ್ರಾಹಕ", "ಗ್ರಾಹಕರು", "ಪ್ರಚಾರ"])) {
    return { page: "customers", needsConnectedData: true, answer: hi ? "Customers खोला है। Customer consent और campaign services अभी connected नहीं हैं; मैंने कोई message नहीं भेजा।" : kn ? "ಗ್ರಾಹಕರ ವಿಭಾಗವನ್ನು ತೆರೆದಿದ್ದೇನೆ. ಗ್ರಾಹಕರ ಒಪ್ಪಿಗೆ ಮತ್ತು ಅಭಿಯಾನ ಸೇವೆಗಳು ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ; ಯಾವುದೇ ಸಂದೇಶ ಕಳುಹಿಸಿಲ್ಲ." : "I opened Customers. Customer consent and campaign services aren’t connected yet; I haven’t sent any messages." };
  }
  if (matches(text, ["loan", "credit", "borrow", "working capital", "लोन", "ऋण", "क्रेडिट", "ಸಾಲ", "ಸಾಲದ ಅರ್ಹತೆ"])) {
    return { page: "loans", needsConnectedData: true, answer: hi ? "Credit खोला है। कोई authorized lending partner जुड़ा नहीं है, इसलिए मैं offer या eligibility का दावा नहीं कर सकता।" : kn ? "ಸಾಲ ವಿಭಾಗವನ್ನು ತೆರೆದಿದ್ದೇನೆ. ಅಧಿಕೃತ ಸಾಲ ಪಾಲುದಾರ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ, ಆದ್ದರಿಂದ ಯಾವುದೇ ಆಫರ್ ಅಥವಾ ಅರ್ಹತೆಯನ್ನು ಹೇಳಲು ಸಾಧ್ಯವಿಲ್ಲ." : "I opened Credit. No authorized lending partner is connected, so I can’t claim an offer or eligibility." };
  }
  if (matches(text, ["gst", "tax", "filing", "invoice", "रिपोर्ट", "जीएसटी", "टैक्स", "ತೆರಿಗೆ", "ವರದಿ", "ಇನ್‌ವಾಯ್ಸ್"])) {
    return { page: "reports", needsConnectedData: true, answer: hi ? "Reports खोला है। GST और tax documents अभी उपलब्ध नहीं हैं; यह tax advice या filing नहीं है।" : kn ? "ವರದಿಗಳನ್ನು ತೆರೆದಿದ್ದೇನೆ. GST ಮತ್ತು ತೆರಿಗೆ ದಾಖಲೆಗಳು ಲಭ್ಯವಿಲ್ಲ; ಇದು ತೆರಿಗೆ ಸಲಹೆ ಅಥವಾ ಸಲ್ಲಿಕೆ ಅಲ್ಲ." : "I opened Reports. GST and tax documents aren’t connected yet; this isn’t tax advice or a filing." };
  }
  if (matches(text, ["notification", "alert", "reminder", "सूचना", "अलर्ट", "ಅಧಿಸೂಚನೆ", "ಎಚ್ಚರಿಕೆ", "ಜ್ಞಾಪನೆ"])) {
    return { page: "notifications", answer: hi ? "Notifications खोला है। Alerts तभी दिखेंगे जब notification service connect होगी।" : kn ? "ಅಧಿಸೂಚನೆಗಳನ್ನು ತೆರೆದಿದ್ದೇನೆ. ಅಧಿಸೂಚನೆ ಸೇವೆ ಸಂಪರ್ಕಗೊಂಡಾಗ ಎಚ್ಚರಿಕೆಗಳು ಕಾಣಿಸುತ್ತವೆ." : "I opened Notifications. Alerts will appear when the notification service is connected." };
  }
  if (matches(text, ["support", "help me", "human", "agent", "सहायता", "मदद", "इंसान", "ಸಹಾಯ", "ಬೆಂಬಲ"])) {
    return { page: "support", answer: hi ? "मैंने Support खोला है। Support ticket भेजने की service अभी उपलब्ध नहीं है।" : kn ? "ಬೆಂಬಲ ವಿಭಾಗವನ್ನು ತೆರೆದಿದ್ದೇನೆ. ಬೆಂಬಲ ಟಿಕೆಟ್ ಸೇವೆ ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ." : "I opened Support. The support-ticket service isn’t available yet." };
  }
  if (matches(text, ["setting", "privacy", "language", "सेटिंग", "भाषा", "गोपनीयता", "ಸೆಟ್ಟಿಂಗ್", "ಭಾಷೆ", "ಗೌಪ್ಯತೆ"])) {
    return { page: "settings", answer: hi ? "मैंने Settings खोला है। ऊपर से English या हिन्दी चुन सकते हैं।" : kn ? "ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ತೆರೆದಿದ್ದೇನೆ. ಮೇಲಿನ ಭಾಷೆ ಆಯ್ಕೆಯಿಂದ English, Hindi ಅಥವಾ Kannada ಆರಿಸಬಹುದು." : "I opened Settings. You can switch between English, Hindi and Kannada from the language control above." };
  }

  return {
    page: "assistant",
    answer: hi
      ? "मैं typed और voice commands से app के sections खोल सकता हूँ। Sales, settlements, credit, stock, customers और tax के live काम के लिए authorized Paytm data और संबंधित service APIs जोड़नी होंगी।"
      : kn
        ? "ನಾನು ಧ್ವನಿ ಅಥವಾ ಪಠ್ಯದಿಂದ ವ್ಯಾಪಾರ ವಿಭಾಗಗಳನ್ನು ತೆರೆಯಬಹುದು. ಮಾರಾಟ, ಸೆಟ್ಲ್‌ಮೆಂಟ್, ಸಾಲ, ಸ್ಟಾಕ್, ಗ್ರಾಹಕರು ಮತ್ತು ತೆರಿಗೆಗೆ ನೈಜ ಕೆಲಸ ಮಾಡಲು ಅಧಿಕೃತ Paytm ಡೇಟಾ ಮತ್ತು ಸಂಬಂಧಿತ ಸೇವೆಗಳು ಬೇಕು."
        : "I can open product areas with typed or voice commands. Live work for sales, settlements, credit, stock, customers and tax needs authorized Paytm data and the matching service APIs.",
  };
}
