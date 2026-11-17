export const lightBending = {
  duration: 11000,
  repeat: Infinity,
  easing: 'ease-in-out',
  keyframes: [
    { filter: 'hue-rotate(0deg) saturate(1)', transform: 'scale(1)' },
    { filter: 'hue-rotate(15deg) saturate(1.4)', transform: 'scale(1.03)' },
    { filter: 'hue-rotate(0deg) saturate(1)', transform: 'scale(1)' }
  ]
};

export default lightBending;
