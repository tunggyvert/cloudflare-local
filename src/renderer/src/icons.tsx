import type { SVGProps } from 'react'

/**
 * One consistent grammar: 16px viewBox, 1.5 stroke, square joins. No filled
 * glyphs, no unicode standing in for icons — the shapes read as engineered
 * line-work, matching the "Technical Precision" system.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </Icon>
  )
}

export function IconContainer(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2 4.5 8 2l6 2.5M2 4.5 8 7m-6-2.5v7L8 14m0-7 6-2.5M8 7v7m6-9.5v7L8 14" />
    </Icon>
  )
}

export function IconTunnel(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
      <path d="M4.5 8h2m3 0h2M8 6.2 9.8 8 8 9.8 6.2 8 8 6.2Z" />
    </Icon>
  )
}

export function IconOrphan(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8 2 14.2 13H1.8L8 2Z" />
      <path d="M8 6.4v3M8 11.2h.01" strokeLinecap="round" />
    </Icon>
  )
}

export function IconLogs(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M1.8 3.5h12.4M1.8 3.5v9a.7.7 0 0 0 .7.7h10.9a.7.7 0 0 0 .7-.7v-9" />
      <path d="M4 6.4 6 8l-2 1.6M7.2 9.6h3.4" strokeLinecap="round" />
    </Icon>
  )
}

export function IconRefresh(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M13 8A5 5 0 1 1 11.2 4.2" strokeLinecap="round" />
      <path d="M13 2v3.2H9.8" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2 4.5h12M2 8h12M2 11.5h12" strokeLinecap="round" />
    </Icon>
  )
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 3l10 10M13 3 3 13" strokeLinecap="round" />
    </Icon>
  )
}

export function IconDns(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12" />
      <path d="M8 2c2.5 0 4 3 4 6s-1.5 6-4 6-4-3-4-6 1.5-6 4-6Z" />
    </Icon>
  )
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 2v1.5M8 12.5V14M12.24 3.76l-1.06 1.06M4.82 11.18l-1.06 1.06M14 8h-1.5M3.5 8H2M12.24 12.24l-1.06-1.06M4.82 4.82 3.76 3.76" />
    </Icon>
  )
}

export function IconKey(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="6" r="3" />
      <path d="M7.88 8.12 2 14v-2.5l2-2 1.5 1.5L7 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3.5 8.5 6 11l6.5-6.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 4h10M4.5 4v9a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4M6 2h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 7v4M9.5 7v4" strokeLinecap="round" />
    </Icon>
  )
}

export function IconChevron(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 3.5l4.5 4.5L6 12.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconLink(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 8l5-5M14 8V2H8" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}
