import { motion } from "framer-motion";
import {
  Film,
  Skull,
  Heart,
  Laugh,
  Rocket,
  Search,
  Swords,
  Ghost,
} from "lucide-react";

const genres = [
  { id: "action", label: "Action", icon: <Swords className="w-6 h-6" /> },
  { id: "comedy", label: "Comedy", icon: <Laugh className="w-6 h-6" /> },
  { id: "drama", label: "Drama", icon: <Film className="w-6 h-6" /> },
  { id: "horror", label: "Horror", icon: <Skull className="w-6 h-6" /> },
  { id: "romance", label: "Romance", icon: <Heart className="w-6 h-6" /> },
  { id: "sci-fi", label: "Sci-Fi", icon: <Rocket className="w-6 h-6" /> },
  { id: "thriller", label: "Thriller", icon: <Ghost className="w-6 h-6" /> },
  { id: "mystery", label: "Mystery", icon: <Search className="w-6 h-6" /> },
];

const StepGenres = ({ selected, onToggle }) => {
  return (
    <div className="text-center space-y-8">
      <div>
        <h2 className="text-3xl font-display font-bold">
          What do you love watching?
        </h2>
        <p className="text-muted-foreground mt-2">
          Pick at least 3 genres that excite you
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto">
        {genres.map((genre, i) => {
          const isSelected = selected.includes(genre.id);
          return (
            <motion.button
              key={genre.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onToggle(genre.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                isSelected
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50"
              }`}
            >
              {genre.icon}
              <span className="text-sm font-medium">{genre.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default StepGenres;
