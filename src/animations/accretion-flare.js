export const accretionFlare = {
  duration: 5000,
  repeat: Infinity,
  easing: 'ease-out',
  keyframes: [
    { opacity: 0.3, filter: 'brightness(1)' },
    { opacity: 1, filter: 'brightness(2.5)' },
    { opacity: 0.3, filter: 'brightness(1)' }
  ]
};

export default accretionFlare;
