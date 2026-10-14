import React from 'react';
import { Composition } from 'remotion';
import { Advert, DURATION } from './Advert';
import { FPS, H, W } from './theme';

export const Root: React.FC = () => (
  <Composition id="ClearanceAdvert" component={Advert} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
);
