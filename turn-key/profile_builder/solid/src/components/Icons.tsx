import type { JSX } from 'solid-js';

export interface IconProps {
  size?: number;
  class?: string;
}

function strokeIcon(render: () => JSX.Element) {
  return (props: IconProps) => (
    <svg
      width={props.size ?? 14}
      height={props.size ?? 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
      aria-hidden="true"
    >
      {render()}
    </svg>
  );
}

export const SearchIcon = strokeIcon(() => (
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </>
));

export const PlusIcon = strokeIcon(() => <path d="M12 5v14M5 12h14" />);

export const CheckIcon = strokeIcon(() => <path d="m5 12.5 4.4 4.4L19 7" />);

export const CodeIcon = strokeIcon(() => (
  <>
    <path d="m8 8.5-4.5 3.5L8 15.5" />
    <path d="m16 8.5 4.5 3.5L16 15.5" />
    <path d="M13.2 5 10.8 19" />
  </>
));

export const EyeIcon = strokeIcon(() => (
  <>
    <path d="M2.5 12S6 5.7 12 5.7 21.5 12 21.5 12 18 18.3 12 18.3 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </>
));

export const CloseIcon = strokeIcon(() => <path d="M6 6 18 18M18 6 6 18" />);

export const ChevronDownIcon = strokeIcon(() => <path d="m6 9 6 6 6-6" />);

export const TrashIcon = strokeIcon(() => (
  <>
    <path d="M4 7h16" />
    <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" />
    <path d="m6.5 7 .9 12.2A1.8 1.8 0 0 0 9.2 21h5.6a1.8 1.8 0 0 0 1.8-1.8L17.5 7" />
    <path d="M10 11v6M14 11v6" />
  </>
));

export const PinIcon = strokeIcon(() => (
  <>
    <path d="M12 17v4.5" />
    <path d="M8 3.5h8l-1 6 3 3.2V15H6v-2.3l3-3.2-1-6Z" />
  </>
));

export const LayersIcon = strokeIcon(() => (
  <>
    <path d="m12 3 9 4.8-9 4.8-9-4.8L12 3Z" />
    <path d="m3 12.5 9 4.8 9-4.8" />
    <path d="m3 17.2 9 4.8 9-4.8" />
  </>
));

export const GridIcon = strokeIcon(() => (
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
  </>
));

export const SlidersIcon = strokeIcon(() => (
  <>
    <path d="M4 6h9M17 6h3" />
    <path d="M4 12h3M11 12h9" />
    <path d="M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </>
));

export const CopyIcon = strokeIcon(() => (
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
  </>
));

export const RefreshIcon = strokeIcon(() => (
  <>
    <path d="M20 11a8 8 0 1 0-2.3 6.3" />
    <path d="M20 4.5V11h-6.3" />
  </>
));

export const DownloadIcon = strokeIcon(() => (
  <>
    <path d="M12 3.5v11" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </>
));

export const UploadIcon = strokeIcon(() => (
  <>
    <path d="M12 15.5v-11" />
    <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
    <path d="M4.5 19.5h15" />
  </>
));

export const PlayIcon = (props: IconProps) => (
  <svg
    width={props.size ?? 12}
    height={props.size ?? 12}
    viewBox="0 0 24 24"
    class={props.class}
    aria-hidden="true"
  >
    <path d="M8 5.2v13.6L19 12 8 5.2Z" fill="currentColor" />
  </svg>
);

export const BoltIcon = strokeIcon(() => <path d="M13.5 2.5 5 13h5l-1 8.5L18.5 10h-5l0-7.5Z" />);

export const CpuIcon = strokeIcon(() => (
  <>
    <rect x="6" y="6" width="12" height="12" rx="2.4" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
  </>
));

export const SunIcon = strokeIcon(() => (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </>
));

export const MoonIcon = strokeIcon(() => (
  <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
));
