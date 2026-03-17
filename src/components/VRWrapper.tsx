"use client";

import dynamic from "next/dynamic";

const VRScene = dynamic(() => import("./VRScene"), {
  ssr: false, // solo cliente
});

export default function VRWrapper() {
  return <VRScene />;
}
