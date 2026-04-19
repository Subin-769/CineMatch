import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const StepComplete = () => {
  return (
    <div className="text-center space-y-6 py-8">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mx-auto w-20 h-20 rounded-full bg-gold/20 flex items-center justify-center"
      >
        <Sparkles className="w-10 h-10 text-gold animate-pulse-glow" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="text-3xl font-display font-bold">You're all set!</h2>
        <p className="text-muted-foreground mt-3 max-w-sm mx-auto">
          We're building your personalized movie universe. Get ready for
          recommendations you'll love.
        </p>
      </motion.div>
    </div>
  );
};

export default StepComplete;
