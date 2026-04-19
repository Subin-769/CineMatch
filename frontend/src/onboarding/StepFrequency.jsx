import { motion } from "framer-motion";
import { Tv, Popcorn, Clapperboard, MonitorPlay } from "lucide-react";

const options = [
  {
    id: "casual",
    label: "Casual Viewer",
    desc: "A few movies a month",
    icon: <Tv className="w-7 h-7" />,
  },
  {
    id: "regular",
    label: "Movie Lover",
    desc: "A couple per week",
    icon: <Popcorn className="w-7 h-7" />,
  },
  {
    id: "binge",
    label: "Binge Watcher",
    desc: "Almost every day",
    icon: <MonitorPlay className="w-7 h-7" />,
  },
  {
    id: "cinephile",
    label: "Cinephile",
    desc: "It's a lifestyle",
    icon: <Clapperboard className="w-7 h-7" />,
  },
];

const StepFrequency = ({ selected, onSelect }) => {
  return (
    <div className="text-center space-y-8">
      <div>
        <h2 className="text-3xl font-display font-bold">
          How often do you watch?
        </h2>
        <p className="text-muted-foreground mt-2">
          This helps us pace your recommendations
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
        {options.map((opt, i) => {
          const isSelected = selected === opt.id;
          return (
            <motion.button
              key={opt.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(opt.id)}
              className={`flex flex-col items-center gap-2 p-6 rounded-lg border-2 transition-colors ${
                isSelected
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50"
              }`}
            >
              {opt.icon}
              <span className="font-semibold text-foreground">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.desc}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default StepFrequency;