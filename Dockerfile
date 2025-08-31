# docker/Dockerfile
FROM golang:1.22 as build
WORKDIR /src
COPY apps/server/ ./
RUN go build -o /out/server ./

FROM gcr.io/distroless/base-debian12
COPY --from=build /out/server /server
EXPOSE 5757
ENTRYPOINT ["/server","-addr=0.0.0.0:5757"]