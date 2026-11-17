export const gravRedshift = {
  duration: 6000,
  repeat: Infinity,
  easing: 'ease-in-out',
  keyframes: [
    { filter: 'hue-rotate(0deg) saturate(1) brightness(1)', opacity: 1 },
    { filter: 'hue-rotate(45deg) saturate(0.6) brightness(0.7)', opacity: 0.8 },
    { filter: 'hue-rotate(0deg) saturate(1) brightness(1)', opacity: 1 }
  ]
};

export default gravRedshift;
