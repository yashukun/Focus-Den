/**
 * Friendly display names for den variants and character choices — shared by
 * the Den tab's Customize panel and the first-run creator.
 */

import type { DenPart } from '../core';

export const DEN_PART_LABELS: Record<DenPart, string> = {
  desk: 'Desk',
  window: 'Window',
  computer: 'Computer',
  drawers: 'Drawers',
  chair: 'Chair',
  floor: 'Floor',
  wallpaper: 'Wallpaper',
};

export const VARIANT_LABELS: Record<string, string> = {
  desk_classic: 'Classic oak', desk_walnut: 'Walnut', desk_white: 'White',
  desk_industrial: 'Industrial', desk_standing: 'Standing',
  window_classic: 'Classic', window_round: 'Round', window_arch: 'Arch',
  window_wide: 'Wide', window_garden: 'Garden',
  computer_desktop: 'Desktop', computer_laptop: 'Laptop',
  computer_ultrawide: 'Ultrawide', computer_allinone: 'All-in-one',
  computer_retro: 'Retro CRT',
  drawers_classic: 'Classic', drawers_tall: 'Tall stack',
  drawers_shelves: 'Open shelves', drawers_minimal: 'None',
  chair_office: 'Office', chair_gaming: 'Gaming', chair_armchair: 'Armchair',
  chair_stool: 'Stool', chair_beanbag: 'Bean bag',
  floor_planks: 'Planks', floor_herringbone: 'Herringbone',
  floor_checker: 'Checker', floor_carpet: 'Carpet', floor_stone: 'Stone',
  wall_plain: 'Plain', wall_striped: 'Striped', wall_stars: 'Starry',
  wall_wainscot: 'Wainscot', wall_brick: 'Brick',
};

export const BODY_LABELS: Record<string, string> = { masc: 'Male', fem: 'Female' };
