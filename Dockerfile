RUN --mount=type=cache,id=s/fc5046e6-d21d-43c1-8ecf-4924737846c8-/root/npm,target=/root/.npm npm install --ignore-scripts
RUN npx prisma generate