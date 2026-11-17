export const frameDragRoll = {
  duration: 12000,
  repeat: Infinity,
  easing: 'ease-in-out',
  keyframes: [
    { transform: 'rotateX(0deg) rotateY(0deg) rotateZ(0deg)' },
    { transform: 'rotateX(5deg) rotateY(10deg) rotateZ(15deg)' },
    { transform: 'rotateX(-5deg) rotateY(-10deg) rotateZ(-15deg)' },
    { transform: 'rotateX(0deg) rotateY(0deg) rotateZ(0deg)' }
  ]
};

export default frameDragRoll;
