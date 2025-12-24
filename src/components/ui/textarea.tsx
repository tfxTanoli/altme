import * as React from 'react';

import {cn} from '@/lib/utils';
import { useFormField } from './form';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({className, ...props}, ref) => {
    // Safely try to get the form field context
    let error;
    try {
      const formFieldContext = useFormField();
      error = formFieldContext.error;
    } catch (e) {
      // This will happen if useFormField is used outside a FormField, which is fine for non-form textareas
      error = null;
    }

    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          error && 'border-destructive',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export {Textarea};
