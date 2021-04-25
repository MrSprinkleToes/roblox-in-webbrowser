var socket = io()

var objs = {}

var scene = new THREE.Scene()
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 15000 )
var sun = null
var ambient = null
var helper = null
var skybox = null

var renderer = new THREE.WebGLRenderer({antialias: true})
renderer.setSize( window.innerWidth, window.innerHeight )
renderer.shadowMap.enabled = true
renderer.shadowMap.style = THREE.PCFSoftShadowMap;
document.body.appendChild( renderer.domElement )

var loader = new THREE.TextureLoader()
loader.crossOrigin = "Anonymous"

camera.position.z = 1
camera.position.x = 1
camera.position.y = 1

var animate = function () {
	requestAnimationFrame( animate )
	renderer.render( scene, camera )
}

// ....................................................
function parse1xMesh(MESHDATA, is10) {
	var vectors = MESHDATA.replace(/]/g, "").split("[");
	var h = vectors.shift();
	var positions = [];
	var normal = [];
	var uv = [];
	// 1.00 assets are scaled up by 2x in the file-
	var offset = is10 ? 0.5 : 1;
  
	function toVector(vstring, offst) {
	  var a = [];
	  for (var i of vstring.split(",")) {
		a.push(parseFloat(i) * offst);
	  }
	  return a;
	}
	for (var i = 0; i < vectors.length; i += 3) {
	  positions.push(...toVector(vectors[i], offset));
	  normal.push(...toVector(vectors[i + 1], 1));
	  uv.push(...toVector(vectors[i + 2], 1));
	}
	console.log(
	  `Parsed version 1 mesh\n\nDetails:\nVectors: ${vectors.length} (/ 3 = ${
		vectors.length / 3
	  })\n\nHeader:`,
	  h
	);
	delete vectors;
	return {
	  positions,
	  normal,
	  uv
	};
  }
  
  function parse2x3xMesh(dv) {
	var headerStart = 13;
	var MeshHeader = {
	  sizeof_MeshHeader: dv.getUint16(headerStart, true),
	  sizeof_Vertex: dv.getUint8(headerStart + 2, true),
	  sizeof_Face: dv.getUint8(headerStart + 3, true),
	  numVerts: dv.getUint32(headerStart + 4, true),
	  numFaces: dv.getUint32(headerStart + 8, true)
	};
	if (MeshHeader.sizeof_MeshHeader > 12) {
	  // v3 header
	  MeshHeader.sizeof_LOD = dv.getUint16(headerStart + 4, true);
	  MeshHeader.numLODs = dv.getUint16(headerStart + 6, true);
	  MeshHeader.numVerts = dv.getUint16(headerStart + 8, true);
	  MeshHeader.numFaces = dv.getUint16(headerStart + 12, true);
	}
	console.log("Parsing version 2/3 mesh\n\nDetails:\n" + JSON.stringify(MeshHeader));
	var i = headerStart + MeshHeader.sizeof_MeshHeader;
	var verticies = [];
	var verticiesEnd =
	  headerStart +
	  MeshHeader.sizeof_MeshHeader +
	  MeshHeader.numVerts * MeshHeader.sizeof_Vertex;
	while (i < verticiesEnd) {
	  var vertex = {
		px: dv.getFloat32(i, true),
		py: dv.getFloat32(i + 4, true),
		pz: dv.getFloat32(i + 8, true),
		nx: dv.getFloat32(i + 12, true),
		ny: dv.getFloat32(i + 16, true),
		nz: dv.getFloat32(i + 20, true),
		u: dv.getFloat32(i + 24, true),
		v: dv.getFloat32(i + 28, true),
		w: dv.getFloat32(i + 32, true),
		r: 255,
		g: 255,
		b: 255,
		a: 255
	  };
	  if (MeshHeader.sizeof_Vertex >= 40) {
		vertex.r = dv.getUint8(i + 36, true);
		vertex.g = dv.getUint8(i + 37, true);
		vertex.b = dv.getUint8(i + 38, true);
		vertex.a = dv.getUint8(i + 39, true);
	  }
	  if (MeshHeader.sizeof_MeshHeader > 12) vertex.u = vertex.u;
	  verticies.push(vertex);
	  i += MeshHeader.sizeof_Vertex;
	}
  
	var faces = [];
	var facesEnd = verticiesEnd + MeshHeader.numFaces * MeshHeader.sizeof_Face;
	while (i < facesEnd) {
	  faces.push({
		a: dv.getUint32(i, true),
		b: dv.getUint32(i + 4, true),
		c: dv.getUint32(i + 8, true)
	  });
	  i += MeshHeader.sizeof_Face;
	}
  
	var LODs = [];
	if (MeshHeader.sizeof_MeshHeader > 12) {
	  var lodsEnd = facesEnd + MeshHeader.numLODs * MeshHeader.sizeof_LOD;
	  while (i < lodsEnd) {
		LODs.push(dv.getUint32(i, true));
		i += MeshHeader.sizeof_LOD;
	  }
	}
  
	console.log({
	  MeshHeader,
	  verticies,
	  faces,
	  LODs
	});
  
	var positions = [];
	var normal = [];
	var uv = [];
  
	for (var faceIdx in faces) {
	  if (LODs.length > 1 && faceIdx > LODs[1]) break;
	  var face = faces[faceIdx];
	  for (var i in face) {
		var vertex = verticies[face[i]];
		positions.push(vertex.px, vertex.py, vertex.pz);
		normal.push(vertex.nx, vertex.ny, vertex.nz);
		uv.push(vertex.u, 1 - vertex.v, vertex.w);
	  }
	}
  
	return {
	  positions,
	  normal,
	  uv
	};
  }
  
  async function parseData(data) {
	var stringData = String.fromCharCode.apply(null, new Uint8Array(data));
	if (stringData.startsWith("version 1.0")) {
	  return parse1xMesh(stringData, stringData.startsWith("version 1.0"));
	} else if (
	  stringData.startsWith("version 2.0") ||
	  stringData.startsWith("version 3.0")
	) {
	  console.log("Parsing v2/3 mesh, header: ", stringData.substring(0, 12));
	  return parse2x3xMesh(new DataView(data));
	} else {
	  console.log("unsupported mesh " + stringData.split("\n")[0]);
	}
  }
  
  var meshCache = {};
  async function getData(mesh) {
	if (meshCache[mesh]) return meshCache[mesh];
	var d = await fetch("http://127.0.0.1:8080/https://assetdelivery.roblox.com/v1/asset/?id=" + mesh);
	var data = await d.arrayBuffer();
	meshCache[mesh] = data;
	return data;
  }
  
  async function createMesh(obj, i) {
	var transparent = obj.transparency > 0
	var data = await getData(obj.meshId);
	var { positions, normal, uv } = await parseData(data);
	window.positions = positions;
	window.normal = normal;
	window.uv = uv;
	const geometry = new THREE.BufferGeometry();
	window.geom = geometry;
	const positionNumComponents = 3;
	const normalNumComponents = 3;
	const uvNumComponents = 3;
	geometry.setAttribute(
	  "position",
	  new THREE.BufferAttribute(
		new Float32Array(positions),
		positionNumComponents
	  )
	);
	geometry.setAttribute(
	  "normal",
	  new THREE.BufferAttribute(new Float32Array(normal), normalNumComponents)
	);
	geometry.setAttribute(
	  "uv",
	  new THREE.BufferAttribute(new Float32Array(uv), uvNumComponents)
	);

	material = new THREE.MeshPhongMaterial( { color: obj.color, transparent: transparent, opacity: obj.transparency*-1+1 } )
  
	cube = new THREE.Mesh(geometry, material);
	cube.receiveShadow = true
	cube.castShadow = true
	scene.add(cube);
	objs[i] = cube
  }
// ....................................................

async function getTexture(texture) {
	var res = await fetch("http://127.0.0.1:8080/https://assetdelivery.roblox.com/v1/assetId/" + texture)
	var result = await res.json()
	return result
}

animate()

async function createTextured(obj, geometry, i) {
	var texture = await getTexture(obj.texture)
	var transparent = obj.transparency > 0
	material = new THREE.MeshPhongMaterial({map: loader.load(texture.location), transparent: transparent, opacity: obj.transparency*-1+1})
	var cube = new THREE.Mesh( geometry, material )
	cube.receiveShadow = true
	cube.castShadow = true
	scene.add( cube )
	objs[i] = cube
}

// async function createMesh(obj, i) {
// 	var mesh = await getTexture(obj.meshId)
// 	console.log(mesh)
// 	meshLoader.load(mesh.location, function(collada) {
// 		dae = collada.scene
// 		dae.scale.set(obj.size.x, obj.size.y, obj.size.z)
// 		dae.updateMatrix()
// 		scene.add(dae)
// 		objs[i] = dae
// 	})
// }

async function setSkybox(skyboxSides) {
	skybox = ""
	var material = []
	material[0] = await getTexture(skyboxSides.front)
	material[1] = await getTexture(skyboxSides.back)
	material[2] = await getTexture(skyboxSides.top)
	material[3] = await getTexture(skyboxSides.bottom)
	material[4] = await getTexture(skyboxSides.right)
	material[5] = await getTexture(skyboxSides.left)
	for (var i = 0; i < material.length; i++) {
		material[i] = new THREE.MeshBasicMaterial({map: loader.load(material[i].location)})
		material[i].side = THREE.BackSide
	}
	var geometry = new THREE.BoxGeometry(10000, 10000, 10000)
	skybox = new THREE.Mesh(geometry, material)
	skybox.position.set(0, 0, 0)
	scene.add(skybox)
	console.log("skybox added")
}

socket.on("render", (data) => {
	data = JSON.parse(data)
	var lightingData = data[2]
	camera.position.set(data[0].position.x, data[0].position.y, data[0].position.z)
	camera.lookAt(data[0].lookat.x, data[0].lookat.y, data[0].lookat.z)
	data = data[1]
	if (sun == null) {
		console.log("create sun")
		sun = new THREE.DirectionalLight( lightingData.color, lightingData.intensity )
		sun.castShadow = true
		sun.shadow.camera.near = -50
		sun.shadow.camera.far = 175
		sun.shadow.camera.left = -125
		sun.shadow.camera.right = 125
		sun.shadow.camera.top = 75
		sun.shadow.camera.bottom = -50
		sun.shadow.mapSize.set(2048, 2048)
		scene.add(helper)
		sun.target.position.set(lightingData.direction.x, lightingData.direction.y, lightingData.direction.z)
		scene.add( sun )
		scene.add(sun.target)
	} else {
		sun.position.copy(camera.position)
		sun.color.setHex(lightingData.color)
		sun.intensity = lightingData.intensity
		sun.target.position.set(lightingData.direction.x, lightingData.direction.y, lightingData.direction.z)
	}
	if (ambient == null) {
		console.log("create sun")
		ambient = new THREE.AmbientLight( lightingData.ambientColor, 0.5 )
		scene.add( ambient )
	} else {
		ambient.color.setHex(lightingData.ambientColor)
	}
	if (skybox == null && lightingData.skybox != null) {
		setSkybox(lightingData.skybox)
	}

	for (var i = 0; i < data.length; i++) {
		var obj = data[i]
		if (objs[i] == null) {
			var transparent = obj.transparency > 0
			var geometry
			var material
			if (obj.shape == "Ball") {
				geometry = new THREE.SphereGeometry(obj.size.x / 2, 10, 10)
			} else if (obj.shape == "Mesh") {
				createMesh(obj, i)
			} else {
				geometry = new THREE.BoxGeometry( 1, 1, 1 )
			}
			if (obj.texture == null && obj.shape != "Mesh") {
				material = new THREE.MeshPhongMaterial( { color: obj.color, transparent: transparent, opacity: obj.transparency*-1+1 } )
				var cube = new THREE.Mesh( geometry, material )
				cube.receiveShadow = true
				cube.castShadow = true
				scene.add( cube )
				objs[i] = cube
			} else if (obj.shape != "Mesh") {
				createTextured(obj, geometry, i)
			}
		} else {
			if (obj.shape != "Ball") {
				objs[i].scale.set(obj.size.x, obj.size.y, obj.size.z)
			}
			objs[i].position.set(obj.position.x, obj.position.y, obj.position.z)
			objs[i].rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z)
			objs[i].material.color.setHex(obj.color)
		}
	}
})