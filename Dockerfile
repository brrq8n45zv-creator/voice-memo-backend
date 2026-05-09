FROM node:22-slim
LABEL "language"="nodejs"
WORKDIR /src
COPY . .
RUN npm install
EXPOSE 8080
CMD ["npm", "start"]