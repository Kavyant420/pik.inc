export const spacetimeRipple = {
  duration: 9000,
  repeat: Infinity,
  easing: 'ease-in-out',
  keyframes: [
    { transform: 'scale(1)', filter: 'contrast(1)' },
    { transform: 'scale(1.08)', filter: 'contrast(1.6)' },
    { transform: 'scale(1)', filter: 'contrast(1)' }
  ]
};

export default spacetimeRipple;
