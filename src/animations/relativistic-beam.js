export const relativisticBeam = {
  duration: 4500,
  repeat: Infinity,
  easing: 'ease-in-out',
  keyframes: [
    { filter: 'brightness(1) hue-rotate(0deg)', opacity: 1 },
    { filter: 'brightness(1.8) hue-rotate(-20deg)', opacity: 0.95 },
    { filter: 'brightness(1) hue-rotate(0deg)', opacity: 1 }
  ]
};

export default relativisticBeam;
