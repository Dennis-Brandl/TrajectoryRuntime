// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { registerElement } from './registry';
import { ButtonElement } from './ButtonElement';
import { TextInputElement } from './TextInputElement';
import { TextareaElement } from './TextareaElement';
import { CheckboxElement } from './CheckboxElement';
import { RadioElement } from './RadioElement';
import { HeaderElement } from './HeaderElement';
import { TextElement } from './TextElement';
import { DividerElement } from './DividerElement';
import { TimerElement } from './TimerElement';
import { ImageElement } from './ImageElement';
import { VideoElement } from './VideoElement';

export function registerDefaultElements(): void {
  registerElement('button', ButtonElement);
  registerElement('textInput', TextInputElement);
  registerElement('textarea', TextareaElement);
  registerElement('checkbox', CheckboxElement);
  registerElement('radio', RadioElement);
  registerElement('header', HeaderElement);
  registerElement('text', TextElement);
  registerElement('divider', DividerElement);
  registerElement('timer', TimerElement);
  registerElement('image', ImageElement);
  registerElement('video', VideoElement);
}
