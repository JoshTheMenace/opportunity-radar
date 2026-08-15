/**
 * Federal Catalyst UI Kit — the vendored design system.
 *
 * Import primitives from here, never from the individual files:
 *
 *     import { Button, OpportunityCard, Badge } from "@/app/components/ui";
 *
 * Styling is 100% in styles/catalyst-kit.css (.or-* classes + tokens). If a
 * screen needs a look the kit doesn't have, the fix is a new kit rule, not a
 * one-off Tailwind override on a kit component.
 */

export { Avatar, Badge, Button, Card, Icon, IconButton, KeyValueRow, ProgressBar, StatTile } from "./core";
export type { BadgeTone, ButtonVariant, CardVariant } from "./core";

export { OpportunityCard, TaskRow } from "./content";
export type { FundingTwin } from "./content";

export { AlertCard, SuggestionCard } from "./feedback";

export { ChatComposer, OptionCard, TextArea } from "./forms";

export { Breadcrumb, SideNavBar, TopNavBar } from "./navigation";
export type { Crumb, NavLink, SideNavItem } from "./navigation";

export { StepProgress, Timeline } from "./progress";
export type { TimelineItem } from "./progress";
