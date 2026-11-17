export const eventHorizonPulse = {
  duration: 3500,
  repeat: Infinity,
  easing: 'ease-in-out',
  keyframes: [
    { opacity: 0.5, transform: 'scale(1)' },
    { opacity: 0.9, transform: 'scale(1.15)' },
    { opacity: 0.5, transform: 'scale(1)' }
  ]
};

export default eventHorizonPulse;
