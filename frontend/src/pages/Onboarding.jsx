import { useMemo, useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import OnboardingProgress from "../onboarding/OnboardingProgress";
import StepFrequency from "../onboarding/StepFrequency";
import StepGenres from "../onboarding/StepGenres";
import StepMoods from "../onboarding/StepMoods";
import StepComplete from "../onboarding/StepComplete";
import api from "../api/api.js";
import { AuthContext } from "../auth/AuthContext";

const TOTAL_STEPS = 4;
const FREQUENCY_LABELS = {
  casual: "Casual Viewer",
  regular: "Movie Lover",
  binge: "Binge Watcher",
  cinephile: "Cinephile",
};
const GENRE_LABELS = {
  action: "Action",
  comedy: "Comedy",
  drama: "Drama",
  horror: "Horror",
  romance: "Romance",
  "sci-fi": "Sci-Fi",
  thriller: "Thriller",
  mystery: "Mystery",
};
const VIBE_LABELS = {
  "feel-good": "Feel-Good",
  "mind-bending": "Mind-Bending",
  "edge-of-seat": "Edge-of-Seat",
  emotional: "Emotional",
  escapist: "Escapist",
  "dark-gritty": "Dark & Gritty",
};

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, refreshMe } = useContext(AuthContext);
  const [step, setStep] = useState(0);
  const [frequency, setFrequency] = useState(null);
  const [genres, setGenres] = useState([]);
  const [moods, setMoods] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isStepValid = useMemo(() => {
    if (step === 0) return Boolean(frequency);
    if (step === 1) return genres.length >= 3;
    if (step === 2) return moods.length >= 1;
    return true;
  }, [step, frequency, genres, moods]);

  useEffect(() => {
    if (user?.onboarding_completed) {
      navigate("/", { replace: true });
    }
  }, [navigate, user]);

  const submitOnboarding = async ({
    watchFrequency = "",
    preferredGenres = [],
    preferredVibe = "",
  } = {}) => {
    await api.post("/onboarding/", {
      watch_frequency: watchFrequency,
      preferred_genres: preferredGenres,
      preferred_vibe: preferredVibe,
      onboarding_completed: true,
    });
    await refreshMe?.();
    navigate("/", { replace: true });
  };

  const finishOnboarding = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitOnboarding({
        watchFrequency: "",
        preferredGenres: [],
        preferredVibe: "",
      });
    } catch (error) {
      console.error("Failed to save onboarding answers", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const completeOnboarding = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitOnboarding({
        watchFrequency: FREQUENCY_LABELS[frequency] || "",
        preferredGenres: genres.map((genre) => GENRE_LABELS[genre] || genre),
        preferredVibe: VIBE_LABELS[moods[0]] || "",
      });
    } catch (error) {
      console.error("Failed to save onboarding answers", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (!isStepValid) return;
    if (step >= TOTAL_STEPS - 2) {
      setStep(TOTAL_STEPS - 1);
      return;
    }
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step === 0) return;
    setStep((s) => s - 1);
  };

  const toggleGenre = (id) => {
    setGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const toggleMood = (id) => {
    setMoods((prev) => (prev.includes(id) ? [] : [id]));
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-10">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-display font-bold text-gold">
            Welcome to CineMatch
          </h1>
          <p className="text-muted-foreground">
            A few quick steps so we can personalize your recommendations
          </p>
        </div>

        <OnboardingProgress currentStep={step} totalSteps={TOTAL_STEPS} />

        <motion.div
          key={step}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-2xl bg-card border border-border p-6 sm:p-8 shadow-lg"
        >
          {step === 0 && (
            <StepFrequency selected={frequency} onSelect={setFrequency} />
          )}
          {step === 1 && <StepGenres selected={genres} onToggle={toggleGenre} />}
          {step === 2 && <StepMoods selected={moods} onToggle={toggleMood} />}
          {step === 3 && <StepComplete />}
        </motion.div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {step > 0 && step < TOTAL_STEPS - 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="rounded-xl border border-border px-5 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 transition"
              >
                Back
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {step < TOTAL_STEPS - 1 ? (
              <button
                type="button"
                onClick={finishOnboarding}
                disabled={isSubmitting}
                className="rounded-xl border border-border px-5 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 transition"
              >
                Skip for now
              </button>
            ) : null}

            {step < TOTAL_STEPS - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStepValid}
                className={`rounded-xl bg-gold px-6 py-2 text-sm font-semibold text-black transition ${
                  !isStepValid ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"
                }`}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={completeOnboarding}
                disabled={isSubmitting}
                className="rounded-xl bg-gold px-6 py-2 text-sm font-semibold text-black transition hover:opacity-90"
              >
                Go to Home
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
