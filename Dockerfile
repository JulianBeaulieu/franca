FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Baked-in courses default. Standalone image users get the 5 bundled courses
# (ar-leb via the root CSVs + de/es/fr/it under /app/courses) with no mounts.
# COURSES_DIR_PATH accepts a colon-separated list; mounting your own dir and
# setting e.g. /app/courses:/data/courses lets your courses add to / override
# the baked ones (last dir wins on a duplicate course code).
ENV COURSES_DIR_PATH=/app/courses

EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
