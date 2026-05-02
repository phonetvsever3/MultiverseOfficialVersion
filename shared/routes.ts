import { z } from 'zod';
import { insertMovieSchema, insertChannelSchema, insertAdSchema, insertSettingsSchema, movies, channels, ads, users, settings, syncedFiles } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  movies: {
    list: {
      method: 'GET' as const,
      path: '/api/movies',
      input: z.object({
        search: z.string().optional(),
        type: z.enum(['movie', 'series']).optional(),
        sort: z.enum(['latest', 'popular', 'rating']).optional(),
        page: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.object({
          items: z.array(z.custom<typeof movies.$inferSelect>()),
          total: z.number()
        }),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/movies/:id',
      responses: {
        200: z.custom<typeof movies.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: { // Admin only
      method: 'POST' as const,
      path: '/api/movies',
      input: insertMovieSchema,
      responses: {
        201: z.custom<typeof movies.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/movies/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/movies/:id',
      input: insertMovieSchema.partial(),
      responses: {
        200: z.custom<typeof movies.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  channels: {
    list: {
      method: 'GET' as const,
      path: '/api/channels',
      responses: {
        200: z.array(z.custom<typeof channels.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/channels',
      input: insertChannelSchema,
      responses: {
        201: z.custom<typeof channels.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/channels/:id',
      responses: {
        204: z.void(),
      },
    },
  },
  ads: {
    list: {
      method: 'GET' as const,
      path: '/api/ads',
      responses: {
        200: z.array(z.custom<typeof ads.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/ads',
      input: insertAdSchema,
      responses: {
        201: z.custom<typeof ads.$inferSelect>(),
      },
    },
    serve: { // For Mini App to get a random ad
      method: 'GET' as const,
      path: '/api/ads/serve',
      responses: {
        200: z.custom<typeof ads.$inferSelect>().nullable(),
      },
    },
    impression: {
      method: 'POST' as const,
      path: '/api/ads/:id/impression',
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    click: {
      method: 'POST' as const,
      path: '/api/ads/:id/click',
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
  stats: {
    dashboard: {
      method: 'GET' as const,
      path: '/api/stats/dashboard',
      responses: {
        200: z.object({
          totalUsers: z.number(),
          totalMovies: z.number(),
          totalSeries: z.number(),
          totalViews: z.number(),
          activeAds: z.number(),
          totalAdClicks: z.number(),
        }),
      },
    },
  },
  syncedFiles: {
    list: {
      method: 'GET' as const,
      path: '/api/synced-files',
      responses: {
        200: z.array(z.custom<typeof syncedFiles.$inferSelect>()),
      },
    },
  },
  settings: {
    get: {
      method: 'GET' as const,
      path: '/api/settings',
      responses: {
        200: z.custom<typeof settings.$inferSelect>(),
      },
    },
    update: {
      method: 'POST' as const,
      path: '/api/settings',
      input: insertSettingsSchema.partial(),
      responses: {
        200: z.custom<typeof settings.$inferSelect>(),
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/admin/login',
      input: z.object({
        username: z.string(),
        password: z.string(),
      }),
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
        401: z.object({ success: z.boolean(), message: z.string() }),
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
