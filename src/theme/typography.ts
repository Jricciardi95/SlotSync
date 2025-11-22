import { TextStyle } from 'react-native';

type Typography = {
  title: TextStyle;
  subtitle: TextStyle;
  body: TextStyle;
  caption: TextStyle;
};

const baseFont = 'SF Pro Display';

export const typography: Typography = {
  title: {
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#F8F8F8',
    fontFamily: baseFont,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 0.4,
    color: '#F8F8F8',
    fontFamily: baseFont,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: 0.15,
    color: '#F8F8F8',
    fontFamily: baseFont,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.25,
    color: 'rgba(248, 248, 248, 0.7)',
    fontFamily: baseFont,
  },
};
