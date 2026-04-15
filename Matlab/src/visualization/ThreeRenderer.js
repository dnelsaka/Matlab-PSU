import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class Hull3DRenderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#f5f5ef");

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);
    this.camera.position.set(140, 65, 140);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    this.grid = new THREE.GridHelper(400, 40, 0x666666, 0xcccccc);
    this.grid.rotateX(Math.PI / 2);
    this.scene.add(this.grid);

    this.scene.add(new THREE.AxesHelper(20));

    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(amb);

    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(100, 120, 90);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-80, 70, -50);
    this.scene.add(fill);

    this.shadedMaterial = new THREE.MeshStandardMaterial({
      color: 0x63886f,
      metalness: 0.1,
      roughness: 0.45,
      side: THREE.DoubleSide,
      clippingPlanes: [],
    });

    this.wireMaterial = new THREE.LineBasicMaterial({
      color: 0x102420,
      transparent: true,
      opacity: 0.85,
      clippingPlanes: [],
    });

    this.sectionPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), Infinity);

    this.hullMesh = null;
    this.wireframeLines = null;

    this.options = {
      showShaded: true,
      showWireframe: true,
      sectionX: null,
    };

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.handleResize();
    this.animate();
  }

  handleResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (width <= 1 || height <= 1) {
      return;
    }

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setDisplayOptions({ showShaded, showWireframe }) {
    if (typeof showShaded === "boolean") {
      this.options.showShaded = showShaded;
    }
    if (typeof showWireframe === "boolean") {
      this.options.showWireframe = showWireframe;
    }

    if (this.hullMesh) {
      this.hullMesh.visible = this.options.showShaded;
    }
    if (this.wireframeLines) {
      this.wireframeLines.visible = this.options.showWireframe;
    }
  }

  setSectionSliceX(xValue) {
    this.options.sectionX = Number.isFinite(xValue) ? xValue : null;

    if (this.options.sectionX === null) {
      this.shadedMaterial.clippingPlanes = [];
      this.wireMaterial.clippingPlanes = [];
      return;
    }

    this.sectionPlane.constant = this.options.sectionX;
    this.shadedMaterial.clippingPlanes = [this.sectionPlane];
    this.wireMaterial.clippingPlanes = [this.sectionPlane];
  }

  updateHull(surface) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(surface.vertices, 3)
    );
    geometry.setIndex(surface.indices);
    geometry.computeVertexNormals();

    if (this.hullMesh) {
      this.rootGroup.remove(this.hullMesh);
      this.hullMesh.geometry.dispose();
    }

    this.hullMesh = new THREE.Mesh(geometry, this.shadedMaterial);
    this.hullMesh.visible = this.options.showShaded;
    this.rootGroup.add(this.hullMesh);

    if (this.wireframeLines) {
      this.rootGroup.remove(this.wireframeLines);
      this.wireframeLines.geometry.dispose();
    }

    const wireGeometry = new THREE.WireframeGeometry(geometry);
    this.wireframeLines = new THREE.LineSegments(wireGeometry, this.wireMaterial);
    this.wireframeLines.visible = this.options.showWireframe;
    this.rootGroup.add(this.wireframeLines);
  }

  focusOnBounds(bounds) {
    const center = new THREE.Vector3(
      (bounds.minX + bounds.maxX) * 0.5,
      (bounds.minY + bounds.maxY) * 0.5,
      (bounds.minZ + bounds.maxZ) * 0.5
    );

    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    const spanZ = bounds.maxZ - bounds.minZ;
    const radius = Math.max(spanX, spanY, spanZ, 1);

    this.controls.target.copy(center);
    this.camera.position.set(center.x + radius * 1.2, center.y + radius * 0.9, center.z + radius * 0.8);
    this.camera.lookAt(center);
    this.controls.update();
  }

  animate() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
