import { EdgesGeometry, BoxGeometry } from 'three';

/** Shared unit geometry — built once, reused by every element in the scene. */
export const UNIT_BOX = new BoxGeometry(1, 1, 1);
export const UNIT_EDGES = new EdgesGeometry(UNIT_BOX);