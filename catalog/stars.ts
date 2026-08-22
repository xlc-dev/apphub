import { z } from "zod";

export const repositoryStarsSchema = z.record(z.string(), z.number().int().nonnegative());
