/**
 * Bible routes — read-mostly endpoints that surface the AI-extracted structure
 * to the frontend dashboards.
 */

import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import {
  Character,
  Location,
  StoryObject,
  Event,
  Relationship,
  Project,
} from '../models/index.js';
import { requireAuth } from './_auth.js';

export async function bibleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  async function ensureProject(req: { userId: string }, projectId: string) {
    return Project.findOne({ _id: projectId, userId: req.userId });
  }

  // List characters
  app.get('/projects/:projectId/characters', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (!(await ensureProject(req, projectId))) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    const characters = await Character.find({ projectId })
      .sort({ importance: 1, canonicalName: 1 })
      .lean();
    return { characters };
  });

  // Single character (full fiche)
  app.get('/characters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const character = await Character.findById(id).lean();
    if (!character) return reply.code(404).send({ error: 'Character not found' });
    if (!(await ensureProject(req, String(character.projectId)))) {
      return reply.code(404).send({ error: 'Character not found' });
    }
    return { character };
  });

  // Characters present in a specific chapter (powers the right-panel "Personnages")
  app.get('/chapters/:chapterId/characters', async (req) => {
    const { chapterId } = req.params as { chapterId: string };
    const characters = await Character.find({
      'appearances.chapterId': new Types.ObjectId(chapterId),
    }).lean();
    return { characters };
  });

  // Locations
  app.get('/projects/:projectId/locations', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (!(await ensureProject(req, projectId))) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    const locations = await Location.find({ projectId }).sort({ canonicalName: 1 }).lean();
    return { locations };
  });

  // Objects
  app.get('/projects/:projectId/objects', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (!(await ensureProject(req, projectId))) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    const objects = await StoryObject.find({ projectId }).sort({ canonicalName: 1 }).lean();
    return { objects };
  });

  // Events / timeline
  app.get('/projects/:projectId/timeline', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (!(await ensureProject(req, projectId))) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    const events = await Event.find({ projectId })
      .sort({ narrativeOrder: 1 })
      .populate('locationId', 'canonicalName')
      .populate('participantIds', 'canonicalName')
      .lean();
    return { events };
  });

  // Relationships (for relationship graph)
  app.get('/projects/:projectId/relationships', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (!(await ensureProject(req, projectId))) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    const relationships = await Relationship.find({ projectId })
      .populate('fromCharacterId', 'canonicalName')
      .populate('toCharacterId', 'canonicalName')
      .lean();
    return { relationships };
  });
}
