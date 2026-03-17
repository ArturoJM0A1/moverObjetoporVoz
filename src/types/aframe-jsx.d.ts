import type * as React from "react";

type AFrameElementProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  Record<string, unknown>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "a-scene": AFrameElementProps;
      "a-entity": AFrameElementProps;
      "a-box": AFrameElementProps;
      "a-plane": AFrameElementProps;
      "a-sky": AFrameElementProps;
      "a-assets": AFrameElementProps;
    }
  }
}