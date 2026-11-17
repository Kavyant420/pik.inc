export const infallAccelerate = {
  duration: 18000,
  repeat: Infinity,
  easing: 'ease-in',
  keyframes: [
    { transform: 'scale(1)', filter: 'blur(0px)' },
    { transform: 'scale(2)', filter: 'blur(4px)' },
    { transform: 'scale(1)', filter: 'blur(0px)' }
  ]
};

export default infallAccelerate;
