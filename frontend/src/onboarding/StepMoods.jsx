import { motion } from "framer-motion";
import { Sun, Brain, Zap, Droplet, Rocket, Moon } from "lucide-react";

const moods = [
  {
    id: "feel-good",
    label: "Feel-Good",
    desc: "Uplifting & heartwarming",
    icon: <Sun className="w-5 h-5" />,
  },
  {
    id: "mind-bending",
    label: "Mind-Bending",
    desc: "Twists & surprises",
    icon: <Brain className="w-5 h-5" />,
  },
  {
    id: "edge-of-seat",
    label: "Edge-of-Seat",
    desc: "Intense & gripping",
    icon: <Zap className="w-5 h-5" />,
  },
  {
    id: "emotional",
    label: "Emotional",
    desc: "Deep & moving stories",
    icon: <Droplet className="w-5 h-5" />,
  },
  {
    id: "escapist",
    label: "Escapist",
    desc: "Fantasy & adventure",
    icon: <Rocket className="w-5 h-5" />,
  },
  {
    id: "dark-gritty",
    label: "Dark & Gritty",
    desc: "Raw & unflinching",
    icon: <Moon className="w-5 h-5" />,
  },
];

const StepMoods = ({ selected, onToggle }) => {
  return (
    <div className="text-center space-y-8">
      <div>
        <h2 className="text-3xl font-display font-bold">What's your vibe?</h2>
        <p className="text-muted-foreground mt-2">
          Choose the moods that match your taste
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
        {moods.map((mood, i) => {
          const isSelected = selected.includes(mood.id);
          return (
            <motion.button
              key={mood.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onToggle(mood.id)}
              className={`flex flex-col items-start p-4 rounded-lg border-2 text-left transition-colors ${
                isSelected
                  ? "border-gold bg-gold/10"
                  : "border-border bg-card hover:border-muted-foreground/50"
              }`}
            >
              <div className="flex items-center gap-2">
                {mood.icon}
                <span className="text-lg font-semibold">{mood.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{mood.desc}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default StepMoods;
