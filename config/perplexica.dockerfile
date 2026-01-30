FROM public.ecr.aws/docker/library/node:24.5.0-slim AS builder

RUN apt-get update && apt-get install -y python3 python3-pip make g++ sqlite3 libsqlite3-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /home/perplexica

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000
RUN npm install -g next

COPY tsconfig.json next.config.mjs next-env.d.ts postcss.config.js drizzle.config.ts tailwind.config.ts ./
COPY src ./src
COPY public ./public

RUN mkdir -p /home/perplexica/data
ENV NEXT_TYPESCRIPT_NO_TYPE_CHECKING=1
RUN yarn build

RUN yarn add --dev @vercel/ncc
RUN yarn ncc build ./src/lib/db/migrate.ts -o migrator

FROM public.ecr.aws/docker/library/node:24.5.0-slim

WORKDIR /home/perplexica

COPY --from=builder /home/perplexica/public ./public
COPY --from=builder /home/perplexica/.next/static ./public/_next/static

COPY --from=builder /home/perplexica/.next/standalone ./
COPY --from=builder /home/perplexica/data ./data
COPY drizzle ./drizzle
COPY --from=builder /home/perplexica/migrator/build ./build
COPY --from=builder /home/perplexica/migrator/index.js ./migrate.js

RUN npm i 

RUN mkdir /home/perplexica/uploads

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 80
#CMD ["sleep", "infinity"]    
CMD ["./entrypoint.sh"]