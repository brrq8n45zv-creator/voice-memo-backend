FROM node:22-slim
LABEL "language"="nodejs"
WORKDIR /src
COPY . .
RUN npm install --registry=https://registry.npmmirror.com/ || npm install
EXPOSE 8080
ENV PORT=8080
CMD ["npm", "start"]