export const redshiftPulse = {
  duration: 4000,
  repeat: Infinity,
  easing: 'ease-in-out',
  keyframes: [
    { filter: 'hue-rotate(0deg) saturate(1)', opacity: 1 },
    { filter: 'hue-rotate(30deg) saturate(1.5)', opacity: 0.85 },
    { filter: 'hue-rotate(0deg) saturate(1)', opacity: 1 }
  ]
};

export default redshiftPulse;
