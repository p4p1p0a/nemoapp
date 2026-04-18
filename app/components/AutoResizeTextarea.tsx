"use client";

import { useRef, useLayoutEffect } from "react";

interface AutoResizeTextareaProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}

export const AutoResizeTextarea = ({
  value,
  onChange,
  placeholder,
  autoFocus,
  onBlur,
}: AutoResizeTextareaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  useLayoutEffect(() => {
    resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full block bg-transparent border-none text-base outline-none resize-none leading-relaxed text-white/90 placeholder:text-white/20 overflow-hidden min-h-[50px] py-1"
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      onBlur={onBlur}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  );
};
