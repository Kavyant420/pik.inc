export const shadowBreathe = {
  duration: 5500,
  repeat: Infinity,
  easing: 'ease-in-out',
  keyframes: [
    { transform: 'scale(1)', opacity: 1 },
    { transform: 'scale(1.05)', opacity: 0.9 },
    { transform: 'scale(1)', opacity: 1 }
  ]
};

export default shadowBreathe;
