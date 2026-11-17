export const ergosphereDrag = {
  duration: 13000,
  repeat: Infinity,
  easing: 'linear',
  keyframes: [
    { transform: 'rotate(0deg) skewX(0deg)' },
    { transform: 'rotate(10deg) skewX(8deg)' },
    { transform: 'rotate(-10deg) skewX(-8deg)' },
    { transform: 'rotate(0deg) skewX(0deg)' }
  ]
};

export default ergosphereDrag;
