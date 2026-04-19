import { useEffect, useState } from "react";
import { loadStoredSettings } from "./lib/settings.js";

const TRANSLATIONS = {
  en: {
    "app.discover": "Discover",
    "app.genres": "Genres",
    "app.subtitle": "Movie Recommendation System",
    "nav.home": "Home",
    "nav.allMovies": "All Movies",
    "nav.watchlist": "Watchlist",
    "nav.settings": "Settings",
    "nav.collapse": "Collapse",
    "genre.action": "Action",
    "genre.comedy": "Comedy",
    "genre.horror": "Horror",
    "genre.scifi": "Sci-Fi",
    "ai.curator": "AI Curator",
    "ai.curator.desc": "Personalized movie picks using AI.",
    "ai.curator.cta": "Start Exploring",
    "topbar.searchPlaceholder": "Search movies, actors, genres...",
    "topbar.watchlist": "Watchlist",
    "topbar.getStarted": "Get Started",
    "topbar.signedInAs": "Signed in as",
    "topbar.guest": "Guest",
    "topbar.signinHint": "Sign in to save ratings & watchlist",
    "topbar.login": "Login",
    "topbar.createAccount": "Create Account",
    "topbar.myProfile": "My Profile",
    "topbar.myWatchlist": "My Watchlist",
    "topbar.myRatings": "My Ratings",
    "topbar.settings": "Settings",
    "topbar.signOutTitle": "Sign out?",
    "topbar.signOutConfirm": "Are you sure you want to log out from CineMatch?",
    "topbar.cancel": "Cancel",
    "topbar.logout": "Logout",
    "topbar.signedOut": "Signed out successfully",
    "hero.featuredToday": "Featured Today",
    "hero.movie": "Movie",
    "hero.viewDetails": "View Details",
    "hero.watchlist": "Watchlist",
    "hero.rate": "Rate",
    "hero.avgOutOf10": "/10 avg",
    "hero.defaultDescription":
      "Discover your next favorite movie with curated picks and personalized recommendations.",
    "home.trending": "Trending Now",
    "home.newReleases": "New Releases",
    "home.aiPicks": "AI Picks for You",
    "home.failedToLoad": "Failed to load movies",
    "settings.title": "Settings",
    "settings.subtitle": "Personalize CineMatch to fit how you watch.",
    "settings.autoSaved": "Changes are saved automatically",
    "settings.account": "Account",
    "settings.profileBasics": "Profile basics",
    "settings.username": "Username",
    "settings.usernameHintLoggedIn": "Update your public display name.",
    "settings.usernameHintLoggedOut": "Login required to edit your username.",
    "settings.saveUsername": "Save username",
    "settings.login": "Login",
    "settings.playback": "Playback",
    "settings.playbackDesc": "Simple viewing options",
    "settings.autoplayTrailers": "Autoplay trailers",
    "settings.autoplayDesc": "Play previews automatically on movie pages.",
    "settings.preferences": "Preferences",
    "settings.themeLanguage": "Theme & language",
    "settings.theme": "Theme",
    "settings.themeDarkOn": "Dark mode is on.",
    "settings.themeLightOn": "Light mode is on.",
    "settings.language": "Language",
    "settings.languageDesc": "Default is English, Nepali is available too.",
    "settings.languageEnglish": "English",
    "settings.languageNepali": "Nepali",
    "settings.personalized": "Personalized picks",
    "settings.personalizedDesc": "Use your activity to refine recommendations.",
  },
  ne: {
    "app.discover": "खोज्नुहोस्",
    "app.genres": "जेनरहरू",
    "app.subtitle": "चलचित्र सिफारिस प्रणाली",
    "nav.home": "होम",
    "nav.allMovies": "सबै चलचित्र",
    "nav.watchlist": "वाचलिस्ट",
    "nav.settings": "सेटिङ्स",
    "nav.collapse": "समेट्नुहोस्",
    "genre.action": "एक्शन",
    "genre.comedy": "कमेडी",
    "genre.horror": "होरर",
    "genre.scifi": "साइ-फाइ",
    "ai.curator": "एआइ क्युरेटर",
    "ai.curator.desc": "एआइ प्रयोग गरी व्यक्तिगत चलचित्र सिफारिसहरू।",
    "ai.curator.cta": "अन्वेषण सुरु गर्नुहोस्",
    "topbar.searchPlaceholder": "चलचित्र, कलाकार, जेनर खोज्नुहोस्...",
    "topbar.watchlist": "वाचलिस्ट",
    "topbar.getStarted": "सुरु गर्नुहोस्",
    "topbar.signedInAs": "यस रूपमा साइन इन",
    "topbar.guest": "अतिथि",
    "topbar.signinHint": "रेटिङ र वाचलिस्ट बचत गर्न साइन इन गर्नुहोस्",
    "topbar.login": "लगइन",
    "topbar.createAccount": "खाता बनाउनुहोस्",
    "topbar.myProfile": "मेरो प्रोफाइल",
    "topbar.myWatchlist": "मेरो वाचलिस्ट",
    "topbar.myRatings": "मेरो रेटिङहरू",
    "topbar.settings": "सेटिङ्स",
    "topbar.signOutTitle": "साइन आउट गर्ने?",
    "topbar.signOutConfirm": "के तपाईं CineMatch बाट लगआउट गर्न चाहनुहुन्छ?",
    "topbar.cancel": "रद्द",
    "topbar.logout": "लगआउट",
    "topbar.signedOut": "सफलतापूर्वक साइन आउट भयो",
    "hero.featuredToday": "आजको विशेष",
    "hero.movie": "चलचित्र",
    "hero.viewDetails": "विवरण हेर्नुहोस्",
    "hero.watchlist": "वाचलिस्ट",
    "hero.rate": "रेट गर्नुहोस्",
    "hero.avgOutOf10": "/10 औसत",
    "hero.defaultDescription":
      "क्युरेटेड छनोट र व्यक्तिगत सिफारिससँग तपाईंको अर्को मनपर्ने चलचित्र पत्ता लगाउनुहोस्।",
    "home.trending": "ट्रेन्डिङ अहिले",
    "home.newReleases": "नयाँ रिलिज",
    "home.aiPicks": "तपाईंका लागि एआइ छनोट",
    "home.failedToLoad": "चलचित्र लोड गर्न सकेन",
    "settings.title": "सेटिङ्स",
    "settings.subtitle": "तपाईंले कसरी हेर्नुहुन्छ त्यसअनुसार CineMatch सेट गर्नुहोस्।",
    "settings.autoSaved": "परिवर्तनहरू स्वचालित रूपमा सुरक्षित हुन्छन्",
    "settings.account": "खाता",
    "settings.profileBasics": "प्रोफाइल जानकारी",
    "settings.username": "प्रयोगकर्ता नाम",
    "settings.usernameHintLoggedIn": "तपाईंको सार्वजनिक नाम अपडेट गर्नुहोस्।",
    "settings.usernameHintLoggedOut": "प्रयोगकर्ता नाम बदल्न लगइन आवश्यक छ।",
    "settings.saveUsername": "प्रयोगकर्ता नाम सुरक्षित गर्नुहोस्",
    "settings.login": "लगइन",
    "settings.playback": "प्लेब्याक",
    "settings.playbackDesc": "सरल हेर्ने विकल्पहरू",
    "settings.autoplayTrailers": "ट्रेलर स्वतः प्ले",
    "settings.autoplayDesc": "चलचित्र पृष्ठमा प्रिभ्यु स्वतः चलाउनुहोस्।",
    "settings.preferences": "प्राथमिकताहरू",
    "settings.themeLanguage": "थिम र भाषा",
    "settings.theme": "थिम",
    "settings.themeDarkOn": "डार्क मोड चालु छ।",
    "settings.themeLightOn": "लाइट मोड चालु छ।",
    "settings.language": "भाषा",
    "settings.languageDesc": "डिफल्ट अंग्रेजी हो, नेपाली पनि उपलब्ध छ।",
    "settings.languageEnglish": "अंग्रेजी",
    "settings.languageNepali": "नेपाली",
    "settings.personalized": "व्यक्तिगत सिफारिस",
    "settings.personalizedDesc": "तपाईंको गतिविधि अनुसार सिफारिस सुधार्नुहोस्।",
  },
};

export function getLanguage() {
  if (typeof window === "undefined") return "en";
  try {
    const settings = loadStoredSettings();
    return settings.language === "ne" ? "ne" : "en";
  } catch {
    return "en";
  }
}

export function useI18n() {
  const [lang, setLang] = useState(getLanguage());

  useEffect(() => {
    function syncLanguage() {
      setLang(getLanguage());
    }
    function onStorage(e) {
      if (e.key === "cinematch:settings") syncLanguage();
    }

    window.addEventListener("language:changed", syncLanguage);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("language:changed", syncLanguage);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const t = (key) => TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;

  return { lang, t };
}
