import { Redis } from "@upstash/redis";

function getRedis() {
  return Redis.fromEnv();
}

function getUtcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10).replaceAll("-", "");
}

function getDailyIpLimitKey(ip: string) {
  return `rate-limit:design-request:${ip}:${getUtcDayKey()}`;
}

function getSecondsUntilTomorrowUtc() {
  const tomorrowUtc = new Date();
  tomorrowUtc.setUTCHours(24, 0, 0, 0);

  return Math.max(1, Math.ceil((tomorrowUtc.getTime() - Date.now()) / 1000));
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || null;
  if (realIp) return realIp.trim() || null;

  return null;
}

export async function checkDailyIpLimit(ip: string) {
  const key = getDailyIpLimitKey(ip);
  const redis = getRedis();
  const count = Number(await redis.get<number | string>(key)) || 0;

  return {
    allowed: count < 3,
    remaining: Math.max(0, 3 - count),
  };
}

export async function incrementDailyIpLimit(ip: string) {
  const key = getDailyIpLimitKey(ip);
  const redis = getRedis();
  const count = await redis.incr(key);

  if (count === 1) await redis.expire(key, getSecondsUntilTomorrowUtc());

  return {
    count,
    remaining: Math.max(0, 3 - count),
  };
}
