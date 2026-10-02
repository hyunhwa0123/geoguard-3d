FROM gradle:8.14.3-jdk21-alpine AS build
WORKDIR /workspace
COPY backend/build.gradle backend/settings.gradle ./
COPY backend/src ./src
RUN gradle bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
