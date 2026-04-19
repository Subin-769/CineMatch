export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        poppins: ["Poppins", "system-ui", "sans-serif"],
      },
      colors: {
        brandYellow: "#FFC105",
        brandOrange: "#FF4400",
        curatorPink: "#EC4899",
        curatorAmber: "#FF9F1A",
        curatorOrange: "#F97316",
      },
    },
  },
  plugins: [],
};
