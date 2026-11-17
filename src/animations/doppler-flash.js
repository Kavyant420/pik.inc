export const dopplerFlash = {
  duration: 2000,
  repeat: Infinity,
  easing: 'ease-out',
  keyframes: [
    { filter: 'brightness(1)', opacity: 1 },
    { filter: 'brightness(2) hue-rotate(-10deg)', opacity: 0.9 },
    { filter: 'brightness(1)', opacity: 1 }
  ]
};

export default dopplerFlash;
