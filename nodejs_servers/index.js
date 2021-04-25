const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)

app.use(express.static(__dirname + "/static"))
app.use(express.text({limit: '100mb', extended: true}))

app.get("/", (req, res) => {
	res.sendFile(__dirname + "/static/watch.html")
})

app.post("/", (req, res) => {
	console.log(req.body)
	io.emit("render", req.body)
	res.send()
})

io.on("connection", (socket) => {
	console.log("connection")
	socket.on("disconnect", () => {
		console.log("disconnection")
	})
})

http.listen(3000, () => {
	console.log("server online")
})