import { z } from "zod";

export const repositoryStarsSchema = z.record(z.string(), z.number().int().nonnegative());

export const repositoryStarEtagsSchema = z.record(z.string(), z.string().min(1));
