export const lensingSwell = {
  duration: 10000,
  repeat: Infinity,
  easing: 'ease-in-out',
  keyframes: [
    { filter: 'contrast(1) brightness(1)', transform: 'scale(1)' },
    { filter: 'contrast(1.4) brightness(1.3)', transform: 'scale(1.05)' },
    { filter: 'contrast(1) brightness(1)', transform: 'scale(1)' }
  ]
};

export default lensingSwell;
