FROM debian:bullseye-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y curl unzip
RUN curl https://bun.sh/install | bash

COPY . .
RUN /root/.bun/bin/bun install --production

FROM debian:bullseye-slim AS runtime

WORKDIR /app

COPY --from=builder /root/.bun/bin/bun /app/bun
COPY --from=builder /app .
COPY .env .

CMD ./bun run src/server.ts