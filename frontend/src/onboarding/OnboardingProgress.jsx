import { motion } from "framer-motion";

const OnboardingProgress = ({ currentStep, totalSteps }) => {
  return (
    <div className="flex gap-2 w-full max-w-md mx-auto">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div key={i} className="flex-1 h-1 rounded-full bg-border overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gold"
            initial={{ width: 0 }}
            animate={{
              width:
                i < currentStep ? "100%" : i === currentStep ? "50%" : "0%",
            }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      ))}
    </div>
  );
};

export default OnboardingProgress;
