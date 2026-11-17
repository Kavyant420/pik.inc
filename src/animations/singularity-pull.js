export const singularityPull = {
  duration: 20000,
  repeat: Infinity,
  easing: 'ease-in',
  keyframes: [
    { transform: 'scale(1)', opacity: 1 },
    { transform: 'scale(1.6)', opacity: 0.4 },
    { transform: 'scale(1)', opacity: 1 }
  ]
};

export default singularityPull;
